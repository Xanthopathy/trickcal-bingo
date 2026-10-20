import {
  BOARD_SIZE,
  BINGO_LINES,
  DEFAULT_PIECE_RATES,
  countLineCells,
  getBoardSummary,
  getPlacementDelta,
  placePiece,
  rankPlacements,
  type AdaptivePlacementCandidate,
  type BingoReward,
  type Board,
  type PieceRates,
  type PlacementCandidate,
  type PieceType,
  type PriorityWeights,
} from '../game'
import {
  evaluateFullGamePlacements,
  type AdaptiveStrategyId,
  type SimulationCheckpoint,
  type SimulationCheckpointStats,
} from '../simulation/engine'

const PIECE_TYPES = Object.keys(DEFAULT_PIECE_RATES) as PieceType[]
const COVERAGE_VALUE = 100
const REGULAR_BINGO_VALUE = 20
const PRIORITY_BINGO_VALUE = REGULAR_BINGO_VALUE * 5
const GAP_PENALTY = 0.5
const PRIORITY_LINE_IDS = new Set(['diagonal-main', 'diagonal-reverse', 'row-3', 'column-3'])
const PRIORITY_LINES = BINGO_LINES.filter((line) => PRIORITY_LINE_IDS.has(line.id))
export const MIN_MEANINGFUL_COVERAGE_DIFFERENCE = 0.5

export type PlannerPatience = 1 | 2 | 3 | 4 | 5

export const DEFAULT_PLANNER_PATIENCE: PlannerPatience = 2

export type PlannerSearchSettings = {
  label: string
  futureTurns: number
  samples: number
  beamWidth: number
  actionsPerPiece: number
}

export const PLANNER_PATIENCE_LEVELS: Record<PlannerPatience, PlannerSearchSettings> = {
  1: { label: 'Quick', futureTurns: 2, samples: 4, beamWidth: 1, actionsPerPiece: 1 },
  2: { label: 'Balanced', futureTurns: 4, samples: 8, beamWidth: 2, actionsPerPiece: 2 },
  3: { label: 'Patient', futureTurns: 6, samples: 12, beamWidth: 2, actionsPerPiece: 2 },
  4: { label: 'Deep', futureTurns: 10, samples: 16, beamWidth: 2, actionsPerPiece: 2 },
  5: { label: 'Maximum', futureTurns: 14, samples: 24, beamWidth: 2, actionsPerPiece: 2 },
}

export type FullBoardCandidate = AdaptivePlacementCandidate & {
  immediatePriorityBingos: number
  immediatePriorityProgress: number
  benchmark: SimulationCheckpointStats
  projectedCoverage: number
  projectedBingos: number
  projectedPriorityBingos: number
  projectedPriorityProgress: number
  projectedGapCount: number
  recommendationScore: number
  horizonDraws: number
  sampleCount: number
  projectedTurnsToStop: number
  skipReadyProbability: number
  projectedReward: BingoReward
}

export type FullBoardPlannerInput = {
  board: Board
  hand: PieceType
  stored: PieceType | null
  pieceRates: PieceRates
  strategy: AdaptiveStrategyId
  benchmarkTiles: SimulationCheckpoint
  priorityWeights?: PriorityWeights
  skipThreshold: number
  patience: PlannerPatience
}

export type FullBoardPlannerResult = {
  handRecommendations: FullBoardCandidate[]
  storedRecommendations: FullBoardCandidate[]
  futureTurns: number
  scenarios: number
}

type FutureState = {
  board: Board
  stored: PieceType | null
  score: number
}

type CandidateStats = {
  candidate: PlacementCandidate
  coverageTotal: number
  bingoTotal: number
  priorityProgressTotal: number
  gapTotal: number
  scoreTotal: number
}

type ScenarioRandom = () => number

const normalizeRates = (rates: PieceRates): PieceRates => {
  const total = PIECE_TYPES.reduce((sum, piece) => sum + Math.max(0, rates[piece]), 0)
  if (total <= 0) return { ...DEFAULT_PIECE_RATES }
  return Object.fromEntries(
    PIECE_TYPES.map((piece) => [piece, Math.max(0, rates[piece]) / total * 100]),
  ) as PieceRates
}

const createRandom = (seed: number): ScenarioRandom => {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

const createScenarioSeed = (board: Board, rates: PieceRates): number => {
  let seed = 0x6d2b79f5
  for (const row of board) {
    for (const cell of row) seed = Math.imul(seed ^ Number(cell), 0x45d9f3b)
  }
  for (const piece of PIECE_TYPES) {
    seed = Math.imul(seed ^ Math.round(rates[piece] * 100), 0x45d9f3b)
  }
  return seed >>> 0 || 1
}

const drawPiece = (random: ScenarioRandom, rates: PieceRates): PieceType => {
  const value = random() * 100
  let cumulative = 0
  for (const piece of PIECE_TYPES) {
    cumulative += rates[piece]
    if (value < cumulative) return piece
  }
  return PIECE_TYPES[PIECE_TYPES.length - 1]
}

const createScenarios = (
  board: Board,
  rates: PieceRates,
  sampleCount: number,
  futureTurns: number,
): PieceType[][] => {
  const random = createRandom(createScenarioSeed(board, rates))
  return Array.from({ length: sampleCount }, () =>
    Array.from({ length: futureTurns }, () => drawPiece(random, rates)),
  )
}

const countTrappedGaps = (board: Board): number => {
  let trapped = 0
  for (let row = 1; row < BOARD_SIZE - 1; row += 1) {
    for (let col = 1; col < BOARD_SIZE - 1; col += 1) {
      if (
        !board[row][col] &&
        board[row - 1][col] &&
        board[row + 1][col] &&
        board[row][col - 1] &&
        board[row][col + 1]
      ) trapped += 1
    }
  }
  return trapped
}

const getPriorityLineProgress = (board: Board): number =>
  PRIORITY_LINES
    .reduce((total, line) => total + countLineCells(board, line), 0)

const getPriorityBingoCount = (board: Board): number =>
  getBoardSummary(board).completedLines
    .filter((line) => PRIORITY_LINE_IDS.has(line.id)).length

const getPriorityLineScore = (board: Board): number =>
  PRIORITY_LINES
    .reduce((total, line) =>
      total + countLineCells(board, line) * PRIORITY_BINGO_VALUE / BOARD_SIZE,
      0)

const getRegularBingoScore = (completedLines: ReturnType<typeof getBoardSummary>['completedLines']): number =>
  completedLines.reduce(
    (total, line) => total + (PRIORITY_LINE_IDS.has(line.id) ? 0 : REGULAR_BINGO_VALUE),
    0,
  )

const boardScore = (
  board: Board,
): number => {
  const summary = getBoardSummary(board)
  return summary.coveredTiles * COVERAGE_VALUE +
    getRegularBingoScore(summary.completedLines) +
    getPriorityLineScore(board) -
    countTrappedGaps(board) * GAP_PENALTY
}

const placementCenters = (piece: PieceType) => {
  if (piece === 'horizontal') {
    return Array.from({ length: BOARD_SIZE }, (_, row) => ({ row, col: 3 }))
  }
  if (piece === 'vertical') {
    return Array.from({ length: BOARD_SIZE }, (_, col) => ({ row: 3, col }))
  }
  if (piece === 'square') {
    return Array.from({ length: (BOARD_SIZE - 2) ** 2 }, (_, index) => ({
      row: Math.floor(index / (BOARD_SIZE - 2)) + 1,
      col: index % (BOARD_SIZE - 2) + 1,
    }))
  }
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
    row: Math.floor(index / BOARD_SIZE),
    col: index % BOARD_SIZE,
  }))
}

const boardKey = (board: Board): string =>
  board.map((row) => row.map((cell) => Number(cell)).join('')).join('')

const candidateActions = (
  state: FutureState,
  piece: PieceType,
  otherPiece: PieceType | null,
  actionsPerPiece: number,
): FutureState[] => {
  const candidates = placementCenters(piece).map((center) => {
    const delta = getPlacementDelta(state.board, piece, center)
    const board = placePiece(state.board, piece, center)
    const summary = getBoardSummary(board)
    return {
      board,
      stored: otherPiece,
      newTiles: delta.newCells.length,
      score: summary.coveredTiles * COVERAGE_VALUE +
        getRegularBingoScore(summary.completedLines) +
        getPriorityLineScore(board) -
        countTrappedGaps(board) * GAP_PENALTY,
      center,
    }
  })

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      right.newTiles - left.newTiles ||
      left.center.row - right.center.row ||
      left.center.col - right.center.col,
  )

  const selected: typeof candidates = []
  const selectedKeys = new Set<string>()

  for (const candidate of candidates) {
    const key = boardKey(candidate.board)
    if (selectedKeys.has(key)) continue
    selected.push(candidate)
    selectedKeys.add(key)
    if (selected.length >= actionsPerPiece) break
  }

  return selected.map(({ board, stored, score }) => ({ board, stored, score }))
}

const searchScenario = (
  initialBoard: Board,
  initialStored: PieceType | null,
  draws: PieceType[],
  searchSettings: PlannerSearchSettings,
) => {
  let beam: FutureState[] = [{
    board: initialBoard,
    stored: initialStored,
    score: boardScore(initialBoard),
  }]
  for (const hand of draws) {
    const nextStates = new Map<string, FutureState>()
    for (const state of beam) {
      const available = state.stored
        ? [
          { piece: hand, otherPiece: state.stored },
          { piece: state.stored, otherPiece: hand },
        ]
        : [{ piece: hand, otherPiece: null }]
      const uniqueChoices = available.filter((choice, index) =>
        available.findIndex((other) =>
          other.piece === choice.piece && other.otherPiece === choice.otherPiece,
        ) === index,
      )
      for (const { piece, otherPiece } of uniqueChoices) {
        for (const next of candidateActions(state, piece, otherPiece, searchSettings.actionsPerPiece)) {
          const summary = getBoardSummary(next.board)
          if (summary.coveredTiles === BOARD_SIZE * BOARD_SIZE) {
            nextStates.set(boardKey(next.board), next)
            continue
          }
          const key = `${boardKey(next.board)}:${next.stored ?? '-'}`
          const previous = nextStates.get(key)
          if (!previous || next.score > previous.score) nextStates.set(key, next)
        }
      }
    }

    beam = [...nextStates.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, searchSettings.beamWidth)
    if (beam.length === 0 || beam.every((state) => getBoardSummary(state.board).coveredTiles === BOARD_SIZE * BOARD_SIZE)) {
      break
    }

  }

  const best = beam.sort((left, right) => right.score - left.score)[0]
  const finalBoard = best?.board ?? initialBoard
  const summary = getBoardSummary(finalBoard)
  return {
    summary,
    priorityProgress: getPriorityLineProgress(finalBoard),
    priorityScore: getPriorityLineScore(finalBoard),
    trappedGaps: countTrappedGaps(finalBoard),
  }
}

const rankPiecePlans = (
  board: Board,
  piece: PieceType,
  storedPiece: PieceType | null,
  scenarios: PieceType[][],
  pieceRates: PieceRates,
  searchSettings: PlannerSearchSettings,
  benchmarkTiles: SimulationCheckpoint,
): FullBoardCandidate[] => {
  const rankedPlacements = rankPlacements(board, piece, pieceRates)
  const hasUsefulPlacement = rankedPlacements.some((candidate) => candidate.newCells > 0)
  const seenAddedTileSets = new Set<string>()
  const candidates = rankedPlacements.filter((candidate) => {
    if (hasUsefulPlacement && candidate.newCells === 0) return false
    const addedTileSet = getPlacementDelta(board, piece, candidate.center).newCells
      .map(({ row, col }) => row * BOARD_SIZE + col)
      .sort((left, right) => left - right)
      .join(',')
    if (seenAddedTileSets.has(addedTileSet)) return false
    seenAddedTileSets.add(addedTileSet)
    return true
  })
  const candidateStats: CandidateStats[] = candidates.map((candidate) => ({
    candidate,
    coverageTotal: 0,
    bingoTotal: 0,
    priorityProgressTotal: 0,
    gapTotal: 0,
    scoreTotal: 0,
  }))

  for (const stats of candidateStats) {
    const nextBoard = placePiece(board, piece, stats.candidate.center)
    const initialStored = storedPiece
    for (const scenario of scenarios) {
      const { summary, priorityProgress, priorityScore, trappedGaps } = searchScenario(
        nextBoard,
        initialStored,
        scenario,
        searchSettings,
      )
      stats.coverageTotal += summary.coveredTiles
      stats.bingoTotal += summary.completedLines.length
      stats.priorityProgressTotal += priorityProgress
      stats.gapTotal += trappedGaps
      stats.scoreTotal += summary.coveredTiles * COVERAGE_VALUE +
        getRegularBingoScore(summary.completedLines) +
        priorityScore -
        trappedGaps * GAP_PENALTY
    }
  }

  const rankedCandidates = candidateStats
    .map(({ candidate, coverageTotal, bingoTotal, priorityProgressTotal, gapTotal, scoreTotal }) => {
      const projectedCoverage = coverageTotal / scenarios.length
      return {
        ...candidate,
        immediateScore: candidate.score,
        score: scoreTotal / scenarios.length,
        projectedCoverage,
        projectedBingos: bingoTotal / scenarios.length,
        projectedPriorityProgress: priorityProgressTotal / scenarios.length,
        projectedGapCount: gapTotal / scenarios.length,
        horizonDraws: searchSettings.futureTurns,
        sampleCount: scenarios.length,
        expectedFutureScore: coverageTotal / scenarios.length,
        explanation: `Projects ${projectedCoverage.toFixed(1)} covered tiles after ${searchSettings.futureTurns} future draws.`,
        futureExplanation: `Estimated across ${scenarios.length} shared draw samples; bingo rewards and enclosed gaps break coverage ties.`,
      }
    })
    .sort((left, right) =>
      right.score - left.score ||
      right.projectedCoverage - left.projectedCoverage ||
      right.newCells - left.newCells ||
      left.center.row - right.center.row ||
      left.center.col - right.center.col,
    )
    .slice(0, 4)

  const rankDenominator = Math.max(rankedCandidates.length - 1, 1)
  return rankedCandidates.map((candidate, index) => ({
    ...candidate,
    immediatePriorityBingos: 0,
    immediatePriorityProgress: 0,
    benchmark: {
      tiles: benchmarkTiles,
      averageTurns: candidate.horizonDraws,
      averageCoveredTiles: candidate.projectedCoverage,
      averageTurnsToSkipReady: 0,
      averageBingos: candidate.projectedBingos,
      averagePriorityBingos: 0,
      averageCoinRewards: 0,
      chanceAllCoinRewards: 0,
      chanceCertificateReward: 0,
      averageReward: { leaves: 0, starCandy: 0, certificates: 0 },
    },
    recommendationScore: Math.round((1 - index / rankDenominator) * 1000) / 10,
    projectedPriorityBingos: 0,
    projectedTurnsToStop: candidate.horizonDraws,
    skipReadyProbability: 0,
    projectedReward: { leaves: 0, starCandy: 0, certificates: 0 },
  }))
}

export const planSampledLookahead = (input: FullBoardPlannerInput): FullBoardPlannerResult => {
  const pieceRates = normalizeRates(input.pieceRates)
  const searchSettings = PLANNER_PATIENCE_LEVELS[input.patience]
  const scenarios = createScenarios(input.board, pieceRates, searchSettings.samples, searchSettings.futureTurns)

  return {
    handRecommendations: rankPiecePlans(
      input.board,
      input.hand,
      input.stored,
      scenarios,
      pieceRates,
      searchSettings,
      input.benchmarkTiles,
    ),
    storedRecommendations: input.stored
      ? rankPiecePlans(
        input.board,
        input.stored,
        input.hand,
        scenarios,
        pieceRates,
        searchSettings,
        input.benchmarkTiles,
      )
      : [],
    futureTurns: searchSettings.futureTurns,
    scenarios: searchSettings.samples,
  }
}

const getDistinctPlacements = (
  board: Board,
  piece: PieceType,
  pieceRates: PieceRates,
): PlacementCandidate[] => {
  const ranked = rankPlacements(board, piece, pieceRates)
  const hasUsefulPlacement = ranked.some((candidate) => candidate.newCells > 0)
  const seenAddedTileSets = new Set<string>()

  return ranked.filter((candidate) => {
    if (hasUsefulPlacement && candidate.newCells === 0) return false
    const addedTileSet = getPlacementDelta(board, piece, candidate.center).newCells
      .map(({ row, col }) => row * BOARD_SIZE + col)
      .sort((left, right) => left - right)
      .join(',')
    if (seenAddedTileSets.has(addedTileSet)) return false
    seenAddedTileSets.add(addedTileSet)
    return true
  })
}

export const planFullBoard = (input: FullBoardPlannerInput): FullBoardPlannerResult => {
  const searchSettings = PLANNER_PATIENCE_LEVELS[input.patience]
  const seed = createScenarioSeed(input.board, normalizeRates(input.pieceRates))

  const planPiece = (piece: PieceType): FullBoardCandidate[] => {
    const placements = getDistinctPlacements(input.board, piece, input.pieceRates)
    const rollouts = evaluateFullGamePlacements({
      strategy: input.strategy,
      benchmarkTiles: input.benchmarkTiles,
      board: input.board,
      hand: input.hand,
      stored: input.stored,
      rates: input.pieceRates,
      priorities: input.priorityWeights,
      skipThreshold: input.skipThreshold,
      seed,
      samples: searchSettings.samples,
      candidates: placements.map(({ center }) => ({ piece, center })),
    })
    const placementByCenter = new Map(
      placements.map((candidate) => [`${candidate.center.row}-${candidate.center.col}`, candidate]),
    )

    const evaluatedCandidates = rollouts.map((rollout) => {
      const candidate = placementByCenter.get(`${rollout.center.row}-${rollout.center.col}`)!
      const immediateBoard = placePiece(input.board, piece, candidate.center)
      const regularBingos = rollout.averageBingos - rollout.averagePriorityBingos
      const priorityScore = rollout.averagePriorityProgress * PRIORITY_BINGO_VALUE / BOARD_SIZE
      const score = rollout.averageCoveredTiles * COVERAGE_VALUE +
        regularBingos * REGULAR_BINGO_VALUE +
        priorityScore -
        rollout.averageGapCount * GAP_PENALTY

      return {
        ...candidate,
        immediateScore: candidate.score,
        immediatePriorityBingos: getPriorityBingoCount(immediateBoard) - getPriorityBingoCount(input.board),
        immediatePriorityProgress: getPriorityLineProgress(immediateBoard) - getPriorityLineProgress(input.board),
        expectedFutureScore: score,
        score,
        projectedCoverage: rollout.averageCoveredTiles,
        projectedBingos: rollout.averageBingos,
        projectedPriorityBingos: rollout.averagePriorityBingos,
        projectedPriorityProgress: rollout.averagePriorityProgress,
        projectedGapCount: rollout.averageGapCount,
        recommendationScore: 0,
        horizonDraws: Math.ceil(rollout.averageTurns),
        sampleCount: searchSettings.samples,
        projectedTurnsToStop: rollout.averageTurns,
        skipReadyProbability: rollout.skipReadyProbability,
        projectedReward: rollout.averageReward,
        benchmark: rollout.benchmark,
        explanation: `Projects ${rollout.averageCoveredTiles.toFixed(1)} covered tiles by the end of a simulated board.`,
        futureExplanation: `Full-board simulation over ${searchSettings.samples} shared sequences using the ${input.strategy} continuation policy.`,
      }
    })
    const epsilon = 1e-9
    const dominates = (better: FullBoardCandidate, worse: FullBoardCandidate) => {
      const noWorse =
        better.projectedCoverage >= worse.projectedCoverage - epsilon &&
        better.projectedBingos >= worse.projectedBingos - epsilon &&
        better.projectedPriorityBingos >= worse.projectedPriorityBingos - epsilon &&
        better.projectedPriorityProgress >= worse.projectedPriorityProgress - epsilon &&
        better.skipReadyProbability >= worse.skipReadyProbability - epsilon &&
        better.projectedTurnsToStop <= worse.projectedTurnsToStop + epsilon &&
        better.projectedReward.leaves >= worse.projectedReward.leaves - epsilon &&
        better.projectedReward.starCandy >= worse.projectedReward.starCandy - epsilon &&
        better.projectedReward.certificates >= worse.projectedReward.certificates - epsilon &&
        better.immediatePriorityBingos >= worse.immediatePriorityBingos &&
        better.immediatePriorityProgress >= worse.immediatePriorityProgress &&
        better.newCells >= worse.newCells
      const strictlyBetter =
        better.projectedCoverage > worse.projectedCoverage + epsilon ||
        better.projectedBingos > worse.projectedBingos + epsilon ||
        better.projectedPriorityBingos > worse.projectedPriorityBingos + epsilon ||
        better.projectedPriorityProgress > worse.projectedPriorityProgress + epsilon ||
        better.skipReadyProbability > worse.skipReadyProbability + epsilon ||
        better.projectedTurnsToStop < worse.projectedTurnsToStop - epsilon ||
        better.projectedReward.leaves > worse.projectedReward.leaves + epsilon ||
        better.projectedReward.starCandy > worse.projectedReward.starCandy + epsilon ||
        better.projectedReward.certificates > worse.projectedReward.certificates + epsilon ||
        better.immediatePriorityBingos > worse.immediatePriorityBingos ||
        better.immediatePriorityProgress > worse.immediatePriorityProgress ||
        better.newCells > worse.newCells
      return noWorse && strictlyBetter
    }
    const nonDominatedCandidates = evaluatedCandidates.filter((candidate) =>
      !evaluatedCandidates.some((other) => other !== candidate && dominates(other, candidate)),
    )

    return nonDominatedCandidates.sort((left, right) =>
      right.benchmark.averagePriorityBingos - left.benchmark.averagePriorityBingos ||
      right.benchmark.averageBingos - left.benchmark.averageBingos ||
      right.benchmark.averageCoveredTiles - left.benchmark.averageCoveredTiles ||
      left.benchmark.averageTurns - right.benchmark.averageTurns ||
      right.benchmark.chanceAllCoinRewards - left.benchmark.chanceAllCoinRewards ||
      right.benchmark.averageCoinRewards - left.benchmark.averageCoinRewards ||
      right.benchmark.chanceCertificateReward - left.benchmark.chanceCertificateReward ||
      right.benchmark.averageReward.certificates - left.benchmark.averageReward.certificates ||
      right.immediatePriorityBingos - left.immediatePriorityBingos ||
      right.immediatePriorityProgress - left.immediatePriorityProgress ||
      right.newCells - left.newCells ||
      left.center.row - right.center.row ||
      left.center.col - right.center.col,
    ).slice(0, 4)
  }

  return {
    handRecommendations: planPiece(input.hand),
    storedRecommendations: input.stored ? planPiece(input.stored) : [],
    futureTurns: 60,
    scenarios: searchSettings.samples,
  }
}