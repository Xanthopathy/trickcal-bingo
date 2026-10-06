export const BOARD_SIZE = 7

export type PieceType =
  | 'plus'
  | 'cross'
  | 'square'
  | 'horizontal'
  | 'vertical'

export type Offset = {
  row: number
  col: number
}

export type Board = boolean[][]

export type Position = {
  row: number
  col: number
}

export type PieceRates = Record<PieceType, number>
export type BingoReward = {
  leaves: number
  starCandy: number
  certificates: number
}

export type PriorityWeights = {
  diagonal: number
  priority: number
  outer: number
  other: number
}

export const DEFAULT_PIECE_RATES: PieceRates = {
  plus: 35,
  cross: 35,
  square: 5,
  horizontal: 12.5,
  vertical: 12.5,
}

export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  diagonal: 6,
  priority: 5,
  outer: 2.2,
  other: 1.6,
}

export const getPlacementCenter = (
  pieceType: PieceType,
  anchor: Position,
): Position => {
  if (pieceType === 'horizontal') {
    return { row: anchor.row, col: Math.floor(BOARD_SIZE / 2) }
  }
  if (pieceType === 'vertical') {
    return { row: Math.floor(BOARD_SIZE / 2), col: anchor.col }
  }
  return anchor
}

export const createEmptyBoard = (): Board =>
  Array.from({ length: BOARD_SIZE }, () =>
    Array<boolean>(BOARD_SIZE).fill(false),
  )

const makeSquareOffsets = (): Offset[] => {
  const offsets: Offset[] = []

  for (let row = -1; row <= 1; row += 1) {
    for (let col = -1; col <= 1; col += 1) {
      offsets.push({ row, col })
    }
  }

  return offsets
}

export const PIECES: Record<PieceType, Offset[]> = {
  plus: [
    { row: -1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
  ],
  cross: [
    { row: -1, col: -1 },
    { row: -1, col: 1 },
    { row: 0, col: 0 },
    { row: 1, col: -1 },
    { row: 1, col: 1 },
  ],
  square: makeSquareOffsets(),
  horizontal: Array.from({ length: 7 }, (_, index) => ({
    row: 0,
    col: index - 3,
  })),
  vertical: Array.from({ length: 7 }, (_, index) => ({
    row: index - 3,
    col: 0,
  })),
}

export const canPlacePiece = (
  _pieceType: PieceType,
  center: Position,
): boolean =>
  Number.isInteger(center.row) &&
  Number.isInteger(center.col) &&
  center.row >= 0 &&
  center.row < BOARD_SIZE &&
  center.col >= 0 &&
  center.col < BOARD_SIZE

export const getPlacementCells = (
  pieceType: PieceType,
  center: Position,
): Position[] =>
  PIECES[pieceType]
    .map(({ row, col }) => ({ row: center.row + row, col: center.col + col }))
    .filter(
      ({ row, col }) =>
        row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE,
    )

export type PlacementDelta = {
  newCells: Position[]
  overlaps: Position[]
}

export const getPlacementDelta = (
  board: Board,
  pieceType: PieceType,
  center: Position,
): PlacementDelta => {
  const newCells: Position[] = []
  const overlaps: Position[] = []

  for (const cell of getPlacementCells(pieceType, center)) {
    if (board[cell.row][cell.col]) overlaps.push(cell)
    else newCells.push(cell)
  }

  return { newCells, overlaps }
}

export const placePiece = (
  board: Board,
  pieceType: PieceType,
  center: Position,
): Board => {
  if (!canPlacePiece(pieceType, center)) {
    throw new RangeError('Piece placement is outside the board')
  }

  const nextBoard = board.map((row) => [...row])

  for (const { row, col } of getPlacementCells(pieceType, center)) {
    nextBoard[row][col] = true
  }

  return nextBoard
}

export type BingoLine = {
  id: string
  label: string
  cells: Position[]
  reward: BingoReward
  kind: 'row' | 'column' | 'diagonal'
}

export type PlacementCandidate = {
  center: Position
  score: number
  newCells: number
  overlaps: number
  completedLines: BingoLine[]
  focusLine: BingoLine | null
  focusProgress: number
  explanation: string
}

const rowRewards: BingoReward[] = [
  { leaves: 10, starCandy: 0, certificates: 0 },
  { leaves: 10, starCandy: 0, certificates: 0 },
  { leaves: 0, starCandy: 10, certificates: 0 },
  { leaves: 0, starCandy: 0, certificates: 5 },
  { leaves: 10, starCandy: 0, certificates: 0 },
  { leaves: 0, starCandy: 10, certificates: 0 },
  { leaves: 10, starCandy: 0, certificates: 0 },
]

const columnRewards: BingoReward[] = [
  { leaves: 10, starCandy: 0, certificates: 0 },
  { leaves: 0, starCandy: 10, certificates: 0 },
  { leaves: 10, starCandy: 0, certificates: 0 },
  { leaves: 0, starCandy: 0, certificates: 5 },
  { leaves: 10, starCandy: 0, certificates: 0 },
  { leaves: 0, starCandy: 10, certificates: 0 },
  { leaves: 10, starCandy: 0, certificates: 0 },
]

const LEAF_REWARD: BingoReward = { leaves: 50, starCandy: 0, certificates: 0 }

export const formatBingoReward = ({ leaves, starCandy, certificates }: BingoReward): string => {
  if (leaves > 0) return `${leaves} LVs`
  if (starCandy > 0) return `${starCandy} SC`
  return `${certificates} CRTs`
}

export const BINGO_LINES: BingoLine[] = [
  ...Array.from({ length: BOARD_SIZE }, (_, row): BingoLine => ({
    id: `row-${row}`,
    label: `Row ${row + 1}`,
    cells: Array.from({ length: BOARD_SIZE }, (_, col) => ({ row, col })),
    reward: rowRewards[row],
    kind: 'row',
  })),
  ...Array.from({ length: BOARD_SIZE }, (_, col): BingoLine => ({
    id: `column-${col}`,
    label: `Column ${String.fromCharCode(65 + col)}`,
    cells: Array.from({ length: BOARD_SIZE }, (_, row) => ({ row, col })),
    reward: columnRewards[col],
    kind: 'column',
  })),
  {
    id: 'diagonal-main',
    label: 'Main diagonal A1 → G7',
    cells: Array.from({ length: BOARD_SIZE }, (_, index) => ({
      row: index,
      col: index,
    })),
    reward: LEAF_REWARD,
    kind: 'diagonal',
  },
  {
    id: 'diagonal-reverse',
    label: 'Main diagonal G1 → A7',
    cells: Array.from({ length: BOARD_SIZE }, (_, index) => ({
      row: index,
      col: BOARD_SIZE - index - 1,
    })),
    reward: LEAF_REWARD,
    kind: 'diagonal',
  },
]

export const getEffectiveLineWeight = (
  line: BingoLine,
  pieceRates: PieceRates = DEFAULT_PIECE_RATES,
  priorityWeights: PriorityWeights = DEFAULT_PRIORITY_WEIGHTS,
): number => {
  const rateTotal = Object.values(pieceRates).reduce((sum, rate) => sum + rate, 0)
  const rates = rateTotal > 0
    ? Object.fromEntries(
      Object.entries(pieceRates).map(([piece, rate]) => [piece, rate / rateTotal]),
    ) as Record<PieceType, number>
    : Object.fromEntries(
      Object.entries(DEFAULT_PIECE_RATES).map(([piece, rate]) => [piece, rate / 100]),
    ) as Record<PieceType, number>

  const availability = line.kind === 'row'
    ? rates.horizontal + rates.plus * 0.15 + rates.square * 0.1
    : line.kind === 'column'
      ? rates.vertical + rates.plus * 0.15 + rates.square * 0.1
      : rates.cross + rates.plus * 0.25 + rates.square * 0.1
  const defaultAvailability = line.kind === 'row'
    ? 0.205
    : line.kind === 'column'
      ? 0.205
      : 0.385
  const availabilityAdjustment = Math.max(
    0.7,
    Math.min(1.3, 1 + (defaultAvailability - availability) * 1.25),
  )
  const isPriorityLine = line.id === 'row-3' || line.id === 'column-3'
  const isOuterLine =
    line.id === 'row-0' || line.id === 'row-6' ||
    line.id === 'column-0' || line.id === 'column-6'
  const priorityWeight = line.kind === 'diagonal'
    ? priorityWeights.diagonal
    : isPriorityLine
      ? priorityWeights.priority
      : isOuterLine
        ? priorityWeights.outer
        : priorityWeights.other

  return priorityWeight * availabilityAdjustment
}

export const countLineCells = (board: Board, line: BingoLine): number =>
  line.cells.reduce(
    (count, { row, col }) => count + Number(board[row][col]),
    0,
  )

export const getCompletedLines = (board: Board): BingoLine[] =>
  BINGO_LINES.filter((line) => countLineCells(board, line) === BOARD_SIZE)

export type BoardSummary = {
  coveredTiles: number
  completedLines: BingoLine[]
  reward: BingoReward
}

export const getBoardSummary = (board: Board): BoardSummary => {
  const completedLines = getCompletedLines(board)
  return {
    coveredTiles: board.reduce(
      (total, row) => total + row.filter(Boolean).length,
      0,
    ),
    completedLines,
    reward: completedLines.reduce(
      (total, line) => ({
        leaves: total.leaves + line.reward.leaves,
        starCandy: total.starCandy + line.reward.starCandy,
        certificates: total.certificates + line.reward.certificates,
      }),
      { leaves: 0, starCandy: 0, certificates: 0 },
    ),
  }
}

const getPieceAffinity = (pieceType: PieceType, line: BingoLine): number => {
  if (pieceType === 'cross' && line.kind === 'diagonal') return 1.35
  if (pieceType === 'horizontal' && line.kind === 'row') return 1.15
  if (pieceType === 'vertical' && line.kind === 'column') return 1.15
  if (pieceType === 'plus' && line.kind !== 'diagonal') return 1.05
  return 1
}

const formatExplanation = (
  completedLines: BingoLine[],
  focusLine: BingoLine | null,
  focusProgress: number,
): string => {
  if (completedLines.length > 0) {
    const [first, ...rest] = completedLines
    const otherCount = rest.length
    return `Completes ${first.label} (${formatBingoReward(first.reward)})${otherCount > 0 ? ` and ${otherCount} more line${otherCount > 1 ? 's' : ''}` : ''}.`
  }

  if (focusLine) {
    return `Adds cells toward ${focusLine.label} (${focusProgress}/7).`
  }

  return 'Adds useful coverage while keeping future options open.'
}

export const rankPlacements = (
  board: Board,
  pieceType: PieceType,
  pieceRates: PieceRates = DEFAULT_PIECE_RATES,
  priorityWeights: PriorityWeights = DEFAULT_PRIORITY_WEIGHTS,
): PlacementCandidate[] => {
  const candidates: PlacementCandidate[] = []
  const centers = pieceType === 'horizontal'
    ? Array.from({ length: BOARD_SIZE }, (_, row) => ({
      row,
      col: Math.floor(BOARD_SIZE / 2),
    }))
    : pieceType === 'vertical'
      ? Array.from({ length: BOARD_SIZE }, (_, col) => ({
        row: Math.floor(BOARD_SIZE / 2),
        col,
      }))
      : Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
        row: Math.floor(index / BOARD_SIZE),
        col: index % BOARD_SIZE,
      }))
  const completedBefore = new Set(
    getCompletedLines(board).map((line) => line.id),
  )
  const lineProgress = new Map(
    BINGO_LINES.map((line) => [line.id, countLineCells(board, line)]),
  )
  const lineWeights = new Map(
    BINGO_LINES.map((line) => [
      line.id,
      getEffectiveLineWeight(line, pieceRates, priorityWeights),
    ]),
  )

  for (const center of centers) {
    if (!canPlacePiece(pieceType, center)) continue

    const delta = getPlacementDelta(board, pieceType, center)
    const addedCells = new Set(
      delta.newCells.map(({ row, col }) => row * BOARD_SIZE + col),
    )
    const completedLines: BingoLine[] = []
    let score = delta.newCells.length * 0.08

    let focusLine: BingoLine | null = null
    let focusProgress = 0
    let focusValue = -1

    for (const line of BINGO_LINES) {
      const before = lineProgress.get(line.id) ?? 0
      if (before === BOARD_SIZE) continue

      const added = line.cells.reduce(
        (count, cell) => count + Number(addedCells.has(cell.row * BOARD_SIZE + cell.col)),
        0,
      )
      if (added === 0) continue

      const affinity = getPieceAffinity(pieceType, line)
      const lineWeight = lineWeights.get(line.id) ?? 0
      const after = before + added
      if (after === BOARD_SIZE) {
        score += lineWeight * 18 * affinity
        if (!completedBefore.has(line.id)) completedLines.push(line)
      } else {
        score += lineWeight * added * (0.45 + before / BOARD_SIZE) * affinity
        const value = lineWeight * added * (0.6 + before / BOARD_SIZE)
        if (value > focusValue) {
          focusValue = value
          focusLine = line
          focusProgress = after
        }
      }
    }

    for (const line of completedLines) {
      score += (lineWeights.get(line.id) ?? 0) * 4
    }

    candidates.push({
      center,
      score,
      newCells: delta.newCells.length,
      overlaps: delta.overlaps.length,
      completedLines,
      focusLine,
      focusProgress,
      explanation: formatExplanation(
        completedLines,
        focusLine,
        focusProgress,
      ),
    })
  }

  return candidates.sort(
    (left, right) =>
      right.score - left.score ||
      right.newCells - left.newCells ||
      left.center.row - right.center.row ||
      left.center.col - right.center.col,
  )
}