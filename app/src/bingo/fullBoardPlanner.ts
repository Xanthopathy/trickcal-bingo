import {
  BOARD_SIZE,
  DEFAULT_PIECE_RATES,
  getBoardSummary,
  getPlacementDelta,
  placePiece,
  rankPlacements,
  type AdaptivePlacementCandidate,
  type Board,
  type PieceRates,
  type PlacementCandidate,
  type PieceType,
} from '../game'

const PIECE_TYPES = Object.keys(DEFAULT_PIECE_RATES) as PieceType[]
const SAMPLE_COUNT = 8
const FUTURE_TURNS = 4
const BEAM_WIDTH = 2
const ACTIONS_PER_PIECE = 2
const COVERAGE_VALUE = 1_000_000
export const MIN_MEANINGFUL_COVERAGE_DIFFERENCE = 0.5

export type FullBoardCandidate = AdaptivePlacementCandidate & {
  projectedCoverage: number
  projectedBingos: number
  projectedGapCount: number
  horizonDraws: number
  sampleCount: number
}

export type FullBoardPlannerInput = {
  board: Board
  hand: PieceType
  stored: PieceType | null
  pieceRates: PieceRates
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

const createScenarios = (board: Board, rates: PieceRates): PieceType[][] => {
  const random = createRandom(createScenarioSeed(board, rates))
  return Array.from({ length: SAMPLE_COUNT }, () =>
    Array.from({ length: FUTURE_TURNS }, () => drawPiece(random, rates)),
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

const boardScore = (
  board: Board,
): number => {
  const summary = getBoardSummary(board)
  return summary.coveredTiles * COVERAGE_VALUE + summary.completedLines.length * 100 - countTrappedGaps(board) * 20
}

const placementCenters = (piece: PieceType) => {
  if (piece === 'horizontal') {
    return Array.from({ length: BOARD_SIZE }, (_, row) => ({ row, col: 3 }))
  }
  if (piece === 'vertical') {
    return Array.from({ length: BOARD_SIZE }, (_, col) => ({ row: 3, col }))
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
): FutureState[] => {
  const candidates = placementCenters(piece).map((center) => {
    const delta = getPlacementDelta(state.board, piece, center)
    const board = placePiece(state.board, piece, center)
    const summary = getBoardSummary(board)
    return {
      board,
      stored: otherPiece,
      newTiles: delta.newCells.length,
      score: summary.coveredTiles * COVERAGE_VALUE + summary.completedLines.length * 100 - countTrappedGaps(board) * 20,
      center,
    }
  })

  candidates.sort(
    (left, right) =>
      right.newTiles - left.newTiles ||
      right.score - left.score ||
      left.center.row - right.center.row ||
      left.center.col - right.center.col,
  )

  const selected: typeof candidates = []
  const selectedKeys = new Set<string>()
  const bestCoverage = candidates[0]?.newTiles ?? 0

  for (const coverage of [bestCoverage, bestCoverage - 1, bestCoverage - 2]) {
    for (const candidate of candidates) {
      if (candidate.newTiles !== coverage) continue
      const key = boardKey(candidate.board)
      if (selectedKeys.has(key)) continue
      selected.push(candidate)
      selectedKeys.add(key)
      if (selected.length >= ACTIONS_PER_PIECE) return selected
    }
  }

  for (const candidate of candidates) {
    const key = boardKey(candidate.board)
    if (selectedKeys.has(key)) continue
    selected.push(candidate)
    selectedKeys.add(key)
    if (selected.length >= ACTIONS_PER_PIECE) break
  }

  return selected.map(({ board, stored, score }) => ({ board, stored, score }))
}

const searchScenario = (
  initialBoard: Board,
  initialStored: PieceType | null,
  draws: PieceType[],
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
        for (const next of candidateActions(state, piece, otherPiece)) {
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
      .slice(0, BEAM_WIDTH)
    if (beam.length === 0 || beam.every((state) => getBoardSummary(state.board).coveredTiles === BOARD_SIZE * BOARD_SIZE)) {
      break
    }

  }

  const best = beam.sort((left, right) => right.score - left.score)[0]
  const finalBoard = best?.board ?? initialBoard
  const summary = getBoardSummary(finalBoard)
  return {
    summary,
    trappedGaps: countTrappedGaps(finalBoard),
  }
}

const rankPiecePlans = (
  board: Board,
  piece: PieceType,
  storedPiece: PieceType | null,
  scenarios: PieceType[][],
  pieceRates: PieceRates,
): FullBoardCandidate[] => {
  const rankedCandidates = rankPlacements(board, piece, pieceRates)
  const hasUsefulPlacement = rankedCandidates.some((candidate) => candidate.newCells > 0)
  const seenAddedTileSets = new Set<string>()
  const candidates = rankedCandidates.filter((candidate) => {
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
    gapTotal: 0,
    scoreTotal: 0,
  }))

  for (const stats of candidateStats) {
    const nextBoard = placePiece(board, piece, stats.candidate.center)
    const initialStored = storedPiece
    for (const scenario of scenarios) {
      const { summary, trappedGaps } = searchScenario(
        nextBoard,
        initialStored,
        scenario,
      )
      stats.coverageTotal += summary.coveredTiles
      stats.bingoTotal += summary.completedLines.length
      stats.gapTotal += trappedGaps
      stats.scoreTotal += summary.coveredTiles * COVERAGE_VALUE + summary.completedLines.length * 100 - trappedGaps * 20
    }
  }

  return candidateStats
    .map(({ candidate, coverageTotal, bingoTotal, gapTotal, scoreTotal }) => {
      const projectedCoverage = coverageTotal / scenarios.length
      return {
        ...candidate,
        immediateScore: candidate.score,
        score: scoreTotal / scenarios.length,
        projectedCoverage,
        projectedBingos: bingoTotal / scenarios.length,
        projectedGapCount: gapTotal / scenarios.length,
        horizonDraws: FUTURE_TURNS,
        sampleCount: scenarios.length,
        expectedFutureScore: coverageTotal / scenarios.length,
        explanation: `Projects ${projectedCoverage.toFixed(1)} covered tiles after ${FUTURE_TURNS} future draws.`,
        futureExplanation: `Estimated across ${SAMPLE_COUNT} shared draw samples; bingo rewards and enclosed gaps break coverage ties.`,
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
}

export const planFullBoard = (input: FullBoardPlannerInput): FullBoardPlannerResult => {
  const pieceRates = normalizeRates(input.pieceRates)
  const scenarios = createScenarios(input.board, pieceRates)

  return {
    handRecommendations: rankPiecePlans(
      input.board,
      input.hand,
      input.stored,
      scenarios,
      pieceRates,
    ),
    storedRecommendations: input.stored
      ? rankPiecePlans(
        input.board,
        input.stored,
        input.hand,
        scenarios,
        pieceRates,
      )
      : [],
    futureTurns: FUTURE_TURNS,
    scenarios: SAMPLE_COUNT,
  }
}