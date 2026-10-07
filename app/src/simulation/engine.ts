import {
  BOARD_SIZE,
  BINGO_LINES,
  DEFAULT_PIECE_RATES,
  DEFAULT_PRIORITY_WEIGHTS,
  countLineCells,
  createEmptyBoard,
  getBoardSummary,
  getPlacementDelta,
  placePiece,
  rankAdaptivePlacements,
  rankPlacements,
  type BingoReward,
  type Board,
  type PieceRates,
  type PieceType,
  type Position,
  type PriorityWeights,
} from '../game'

export type SimulationStrategyId =
  | 'four-by-three'
  | 'adaptive-fill'
  | 'adaptive-priority'
  | 'adaptive-lookahead'

export const SIMULATION_STRATEGIES: {
  id: SimulationStrategyId
  name: string
  description: string
}[] = [
    {
      id: 'four-by-three',
      name: '4×3 baseline',
      description: 'Uses the outer quadrants for small shapes and saves the middle row and column for long pieces.',
    },
    {
      id: 'adaptive-fill',
      name: 'Adaptive: fill tiles',
      description: 'Chooses the available piece placement that covers the most new tiles.',
    },
    {
      id: 'adaptive-priority',
      name: 'Adaptive: priority bingos',
      description: 'Uses line progress and the configured piece rates to favor valuable bingo lines.',
    },
    {
      id: 'adaptive-lookahead',
      name: 'Adaptive: one-draw lookahead',
      description: 'Uses the current planner heuristic, including the stored piece and weighted next draw.',
    },
  ]

export type SimulationInput = {
  trials: number
  seed: number
  skipThreshold: number
  pieceRates: PieceRates
  priorityWeights?: PriorityWeights
  strategies: SimulationStrategyId[]
}

export type SimulationResult = {
  strategy: SimulationStrategyId
  trials: number
  averageTurnsToThreshold: number
  averageTurnsAfterThreshold: number
  averageBingosAtThreshold: number
  averagePriorityBingosAtThreshold: number
  averageCoinRewardsAtThreshold: number
  chanceAllCoinRewardsAtThreshold: number
  chanceCertificateRewardAtThreshold: number
  averageRewardAtThreshold: BingoReward
  averageBingosAtSkip: number
  averageRewardAtSkip: BingoReward
}

export type SimulationComparison = {
  seed: number
  trials: number
  skipThreshold: number
  results: SimulationResult[]
}

export type SimulationMove = {
  turn: number
  hand: PieceType
  stored: PieceType | null
  placed: PieceType
  center: Position
  board: Board
  newCells: Position[]
  overlaps: Position[]
  newBingos: string[]
  rewardPickups: { row: number; col: number; type: 'coin' | 'certificate' }[]
  revealedRewards: { row: number; col: number; type: 'coin' | 'certificate' }[]
  coveredTiles: number
  bingos: number
}

export type SimulationReplay = {
  seed: number
  trial: number
  strategies: { strategy: SimulationStrategyId; moves: SimulationMove[] }[]
}

type Random = () => number

type TrialScenario = {
  draws: PieceType[]
  coinTiles: Set<number>
  certificateTile: number
}

type GameSnapshot = {
  turns: number
  coveredTiles: number
  bingos: number
  priorityBingos: number
  coinRewards: number
  certificateReward: boolean
  reward: BingoReward
}

const PRIORITY_LINE_IDS = new Set([
  'diagonal-main',
  'diagonal-reverse',
  'column-3',
  'row-3',
])

const PIECE_TYPES = Object.keys(DEFAULT_PIECE_RATES) as PieceType[]
const QUADRANT_CENTERS: Position[] = [
  { row: 1, col: 1 },
  { row: 1, col: 5 },
  { row: 5, col: 1 },
  { row: 5, col: 5 },
]

const createRandom = (seed: number): Random => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const mixSeed = (seed: number, trial: number): number =>
  (seed + Math.imul(trial + 1, 0x9e3779b1)) >>> 0

const normalizeRates = (rates: PieceRates): PieceRates => {
  const total = PIECE_TYPES.reduce((sum, piece) => sum + Math.max(0, rates[piece]), 0)
  if (total <= 0) return { ...DEFAULT_PIECE_RATES }
  return Object.fromEntries(
    PIECE_TYPES.map((piece) => [piece, Math.max(0, rates[piece]) / total * 100]),
  ) as PieceRates
}

const drawPiece = (random: Random, rates: PieceRates): PieceType => {
  const value = random() * 100
  let cumulative = 0
  for (const piece of PIECE_TYPES) {
    cumulative += rates[piece]
    if (value < cumulative) return piece
  }
  return PIECE_TYPES[PIECE_TYPES.length - 1]
}

const shuffle = <T,>(values: T[], random: Random): T[] => {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
      ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

const makeScenario = (seed: number, trial: number, rates: PieceRates): TrialScenario => {
  const random = createRandom(mixSeed(seed, trial))
  const draws = Array.from({ length: 60 }, () => drawPiece(random, rates))
  const specialTiles = shuffle(
    Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => index),
    random,
  )
  return {
    draws,
    coinTiles: new Set(specialTiles.slice(0, 3)),
    certificateTile: specialTiles[3],
  }
}

const centersFor = (piece: PieceType): Position[] => {
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

const placementWithMostNewTiles = (board: Board, piece: PieceType) =>
  centersFor(piece)
    .map((center) => ({
      center,
      delta: getPlacementDelta(board, piece, center),
    }))
    .sort(
      (left, right) =>
        right.delta.newCells.length - left.delta.newCells.length ||
        left.center.row - right.center.row ||
        left.center.col - right.center.col,
    )[0]

const bestFourByThreePlacement = (
  board: Board,
  piece: PieceType,
) => {
  if (piece === 'horizontal' || piece === 'vertical') {
    const isHorizontal = piece === 'horizontal'
    const targetLine = isHorizontal ? BINGO_LINES.find((line) => line.id === 'row-3')! : BINGO_LINES.find((line) => line.id === 'column-3')!
    const targetIsOpen = countLineCells(board, targetLine) < BOARD_SIZE
    const preferredIndices = isHorizontal
      ? targetIsOpen ? [3] : [0, 6, 4, 2, 1, 5]
      : targetIsOpen ? [3] : [0, 6, 2, 4, 1, 5]
    const candidates = preferredIndices.map((index, rank) => {
      const center = isHorizontal ? { row: index, col: 3 } : { row: 3, col: index }
      const delta = getPlacementDelta(board, piece, center)
      return {
        center,
        delta,
        score: (targetIsOpen && rank === 0 ? 1000 : 0) + delta.newCells.length + (preferredIndices.length - rank) * 0.01,
      }
    })
    return candidates.sort((left, right) => right.score - left.score)[0]
  }

  const quadrantCandidates = QUADRANT_CENTERS.map((center) => ({
    center,
    delta: getPlacementDelta(board, piece, center),
  }))
  const bestQuadrant = quadrantCandidates.sort(
    (left, right) =>
      right.delta.newCells.length - left.delta.newCells.length ||
      left.center.row - right.center.row ||
      left.center.col - right.center.col,
  )[0]
  if (bestQuadrant.delta.newCells.length > 0) return { ...bestQuadrant, score: bestQuadrant.delta.newCells.length }

  const fallback = placementWithMostNewTiles(board, piece)
  return { ...fallback, score: fallback.delta.newCells.length }
}

const chooseMove = (
  strategy: SimulationStrategyId,
  board: Board,
  hand: PieceType,
  stored: PieceType | null,
  rates: PieceRates,
  priorities: PriorityWeights,
) => {
  const availablePieces = stored ? [hand, stored] : [hand]
  const options = availablePieces.map((piece, index) => {
    const otherPiece = availablePieces[1 - index] ?? null
    if (strategy === 'four-by-three') {
      return { piece, otherPiece, ...bestFourByThreePlacement(board, piece) }
    }
    if (strategy === 'adaptive-fill') {
      const placement = placementWithMostNewTiles(board, piece)
      return { piece, otherPiece, ...placement, score: placement.delta.newCells.length }
    }
    if (strategy === 'adaptive-lookahead') {
      const candidate = rankAdaptivePlacements(board, piece, otherPiece, rates, priorities)[0]
      return candidate
        ? {
          piece,
          otherPiece,
          center: candidate.center,
          delta: getPlacementDelta(board, piece, candidate.center),
          score: candidate.score,
        }
        : null
    }
    const candidate = rankPlacements(board, piece, rates, priorities)[0]
    return candidate
      ? {
        piece,
        otherPiece,
        center: candidate.center,
        delta: getPlacementDelta(board, piece, candidate.center),
        score: candidate.score,
      }
      : null
  }).filter((option): option is NonNullable<typeof option> => option !== null)

  options.sort(
    (left, right) =>
      right.score - left.score ||
      right.delta.newCells.length - left.delta.newCells.length ||
      left.center.row - right.center.row ||
      left.center.col - right.center.col,
  )
  return options[0]
}

const makeSnapshot = (
  board: Board,
  turns: number,
  coinRewards: number,
  certificateReward: boolean,
): GameSnapshot => {
  const summary = getBoardSummary(board)
  return {
    turns,
    coveredTiles: summary.coveredTiles,
    bingos: summary.completedLines.length,
    priorityBingos: summary.completedLines.filter((line) => PRIORITY_LINE_IDS.has(line.id)).length,
    coinRewards,
    certificateReward,
    reward: summary.reward,
  }
}

const addRewards = (total: BingoReward, value: BingoReward): BingoReward => ({
  leaves: total.leaves + value.leaves,
  starCandy: total.starCandy + value.starCandy,
  certificates: total.certificates + value.certificates,
})

const simulateGame = (
  strategy: SimulationStrategyId,
  scenario: TrialScenario,
  rates: PieceRates,
  priorities: PriorityWeights,
  skipThreshold: number,
  recordMoves = false,
) => {
  let board = createEmptyBoard()
  let hand = scenario.draws[0]
  let stored: PieceType | null = null
  let turns = 0
  let coinRewards = 0
  let certificateReward = false
  let thresholdSnapshot: GameSnapshot | null = null
  let finalSnapshot: GameSnapshot | null = null
  const moves: SimulationMove[] = []
  const revealedRewards = new Map<number, 'coin' | 'certificate'>()

  while (turns < scenario.draws.length) {
    const move = chooseMove(strategy, board, hand, stored, rates, priorities)
    if (!move) break

    const completedBefore = new Set(getBoardSummary(board).completedLines.map((line) => line.id))
    const handBefore = hand
    const storedBefore = stored
    board = placePiece(board, move.piece, move.center)
    turns += 1
    const rewardPickups: SimulationMove['rewardPickups'] = []

    for (const cell of move.delta.newCells) {
      const tileId = cell.row * BOARD_SIZE + cell.col
      if (scenario.coinTiles.has(tileId)) {
        coinRewards += 1
        rewardPickups.push({ ...cell, type: 'coin' })
        revealedRewards.set(tileId, 'coin')
      }
      if (scenario.certificateTile === tileId) {
        certificateReward = true
        rewardPickups.push({ ...cell, type: 'certificate' })
        revealedRewards.set(tileId, 'certificate')
      }
    }

    const snapshot = makeSnapshot(board, turns, coinRewards, certificateReward)
    if (recordMoves) {
      const summary = getBoardSummary(board)
      moves.push({
        turn: turns,
        hand: handBefore,
        stored: storedBefore,
        placed: move.piece,
        center: move.center,
        board,
        newCells: move.delta.newCells,
        overlaps: move.delta.overlaps,
        newBingos: summary.completedLines
          .filter((line) => !completedBefore.has(line.id))
          .map((line) => line.label),
        rewardPickups,
        revealedRewards: Array.from(revealedRewards, ([tileId, type]) => ({
          row: Math.floor(tileId / BOARD_SIZE),
          col: tileId % BOARD_SIZE,
          type,
        })),
        coveredTiles: snapshot.coveredTiles,
        bingos: snapshot.bingos,
      })
    }
    if (thresholdSnapshot === null && snapshot.coveredTiles >= skipThreshold) {
      thresholdSnapshot = snapshot
    }

    const skipReady =
      snapshot.coveredTiles >= skipThreshold &&
      snapshot.priorityBingos === 4 &&
      snapshot.coinRewards === 3 &&
      snapshot.certificateReward

    if (skipReady || snapshot.coveredTiles === BOARD_SIZE * BOARD_SIZE) {
      finalSnapshot = snapshot
      break
    }

    stored = move.otherPiece
    hand = scenario.draws[turns]
  }

  finalSnapshot ??= makeSnapshot(board, turns, coinRewards, certificateReward)
  thresholdSnapshot ??= finalSnapshot
  return { thresholdSnapshot, finalSnapshot, moves }
}

export const runSimulationReplay = (
  input: SimulationInput,
  trial: number,
): SimulationReplay => {
  const rates = normalizeRates(input.pieceRates)
  const priorities = input.priorityWeights ?? DEFAULT_PRIORITY_WEIGHTS
  const trialCount = Math.max(1, Math.min(1000, Math.floor(input.trials)))
  const selectedTrial = Math.max(1, Math.min(trialCount, Math.floor(trial)))
  const scenario = makeScenario(input.seed, selectedTrial - 1, rates)

  return {
    seed: input.seed,
    trial: selectedTrial,
    strategies: [...new Set(input.strategies)].map((strategy) => ({
      strategy,
      moves: simulateGame(
        strategy,
        scenario,
        rates,
        priorities,
        input.skipThreshold,
        true,
      ).moves,
    })),
  }
}

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)

export const runSimulationComparison = (input: SimulationInput): SimulationComparison => {
  const trials = Math.max(1, Math.min(1000, Math.floor(input.trials)))
  const rates = normalizeRates(input.pieceRates)
  const priorities = input.priorityWeights ?? DEFAULT_PRIORITY_WEIGHTS
  const selectedStrategies = [...new Set(input.strategies)]
  const scenarios = Array.from({ length: trials }, (_, index) =>
    makeScenario(input.seed, index, rates),
  )

  const results = selectedStrategies.map((strategy): SimulationResult => {
    const games = scenarios.map((scenario) =>
      simulateGame(strategy, scenario, rates, priorities, input.skipThreshold),
    )
    const atThreshold = games.map((game) => game.thresholdSnapshot)
    const atSkip = games.map((game) => game.finalSnapshot)

    return {
      strategy,
      trials,
      averageTurnsToThreshold: average(atThreshold.map((game) => game.turns)),
      averageTurnsAfterThreshold: average(games.map((game) => Math.max(0, game.finalSnapshot.turns - game.thresholdSnapshot.turns))),
      averageBingosAtThreshold: average(atThreshold.map((game) => game.bingos)),
      averagePriorityBingosAtThreshold: average(atThreshold.map((game) => game.priorityBingos)),
      averageCoinRewardsAtThreshold: average(atThreshold.map((game) => game.coinRewards)),
      chanceAllCoinRewardsAtThreshold: atThreshold.filter((game) => game.coinRewards === 3).length / trials,
      chanceCertificateRewardAtThreshold: atThreshold.filter((game) => game.certificateReward).length / trials,
      averageRewardAtThreshold: {
        leaves: average(atThreshold.map((game) => game.reward.leaves)),
        starCandy: average(atThreshold.map((game) => game.reward.starCandy)),
        certificates: average(atThreshold.map((game) => game.reward.certificates)),
      },
      averageBingosAtSkip: average(atSkip.map((game) => game.bingos)),
      averageRewardAtSkip: atSkip.reduce(
        (total, game) => addRewards(total, game.reward),
        { leaves: 0, starCandy: 0, certificates: 0 },
      ),
    }
  })

  return {
    seed: input.seed,
    trials,
    skipThreshold: input.skipThreshold,
    results: results.map((result) => ({
      ...result,
      averageRewardAtSkip: {
        leaves: result.averageRewardAtSkip.leaves / trials,
        starCandy: result.averageRewardAtSkip.starCandy / trials,
        certificates: result.averageRewardAtSkip.certificates / trials,
      },
    })),
  }
}

