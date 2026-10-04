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

export const placePiece = (
  board: Board,
  pieceType: PieceType,
  center: Position,
): Board => {
  if (!canPlacePiece(pieceType, center)) {
    throw new RangeError('Piece placement is outside the board')
  }

  const nextBoard = board.map((row) => [...row])

  for (const offset of PIECES[pieceType]) {
    const row = center.row + offset.row
    const col = center.col + offset.col
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
      continue
    }
    nextBoard[row][col] = true
  }

  return nextBoard
}

export type BingoLine = {
  id: string
  label: string
  cells: Position[]
  reward: string
  weight: number
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

const rowRewards = [
  '10 LVs',
  '10 LVs',
  '10 SC',
  '5 CRTs',
  '10 LVs',
  '10 SC',
  '10 LVs',
]

const columnRewards = [
  '10 LVs',
  '10 SC',
  '10 LVs',
  '5 CRTs',
  '10 LVs',
  '10 SC',
  '10 LVs',
]

export const BINGO_LINES: BingoLine[] = [
  ...Array.from({ length: BOARD_SIZE }, (_, row): BingoLine => ({
    id: `row-${row}`,
    label: `Row ${row + 1}`,
    cells: Array.from({ length: BOARD_SIZE }, (_, col) => ({ row, col })),
    reward: rowRewards[row],
    weight: row === 3 ? 5 : row === 0 || row === 6 ? 2.2 : 1.6,
    kind: 'row',
  })),
  ...Array.from({ length: BOARD_SIZE }, (_, col): BingoLine => ({
    id: `column-${col}`,
    label: `Column ${String.fromCharCode(65 + col)}`,
    cells: Array.from({ length: BOARD_SIZE }, (_, row) => ({ row, col })),
    reward: columnRewards[col],
    weight: col === 3 ? 5 : col === 0 || col === 6 ? 2.2 : 1.6,
    kind: 'column',
  })),
  {
    id: 'diagonal-main',
    label: 'Main diagonal A1 → G7',
    cells: Array.from({ length: BOARD_SIZE }, (_, index) => ({
      row: index,
      col: index,
    })),
    reward: '50 LVs',
    weight: 6,
    kind: 'diagonal',
  },
  {
    id: 'diagonal-reverse',
    label: 'Main diagonal G1 → A7',
    cells: Array.from({ length: BOARD_SIZE }, (_, index) => ({
      row: index,
      col: BOARD_SIZE - index - 1,
    })),
    reward: '50 LVs',
    weight: 6,
    kind: 'diagonal',
  },
]

export const countLineCells = (board: Board, line: BingoLine): number =>
  line.cells.reduce(
    (count, { row, col }) => count + Number(board[row][col]),
    0,
  )

export const getCompletedLines = (board: Board): BingoLine[] =>
  BINGO_LINES.filter((line) => countLineCells(board, line) === BOARD_SIZE)

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
    return `Completes ${first.label} (${first.reward})${otherCount > 0 ? ` and ${otherCount} more line${otherCount > 1 ? 's' : ''}` : ''}.`
  }

  if (focusLine) {
    return `Adds cells toward ${focusLine.label} (${focusProgress}/7).`
  }

  return 'Adds useful coverage while keeping future options open.'
}

export const rankPlacements = (
  board: Board,
  pieceType: PieceType,
): PlacementCandidate[] => {
  const candidates: PlacementCandidate[] = []
  const completedBefore = new Set(
    getCompletedLines(board).map((line) => line.id),
  )

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const center = { row, col }
      if (!canPlacePiece(pieceType, center)) continue

      const nextBoard = placePiece(board, pieceType, center)
      const coveredOffsets = PIECES[pieceType].filter(({ row: rowOffset, col: colOffset }) => {
        const nextRow = row + rowOffset
        const nextCol = col + colOffset
        return nextRow >= 0 && nextRow < BOARD_SIZE && nextCol >= 0 && nextCol < BOARD_SIZE
      })
      const newCells = coveredOffsets.filter(
        ({ row: rowOffset, col: colOffset }) => !board[row + rowOffset][col + colOffset],
      ).length
      const overlaps = coveredOffsets.length - newCells
      const completedLines = getCompletedLines(nextBoard).filter(
        (line) => !completedBefore.has(line.id),
      )
      let score = newCells * 0.08

      let focusLine: BingoLine | null = null
      let focusProgress = 0
      let focusValue = -1

      for (const line of BINGO_LINES) {
        const before = countLineCells(board, line)
        if (before === BOARD_SIZE) continue

        const after = countLineCells(nextBoard, line)
        const added = after - before
        if (added === 0) continue

        const affinity = getPieceAffinity(pieceType, line)
        if (after === BOARD_SIZE) {
          score += line.weight * 18 * affinity
        } else {
          score += line.weight * added * (0.45 + before / BOARD_SIZE) * affinity
          const value = line.weight * added * (0.6 + before / BOARD_SIZE)
          if (value > focusValue) {
            focusValue = value
            focusLine = line
            focusProgress = after
          }
        }
      }

      for (const line of completedLines) {
        score += line.weight * 4
      }

      candidates.push({
        center,
        score,
        newCells,
        overlaps,
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
  }

  return candidates.sort(
    (left, right) =>
      right.score - left.score ||
      right.newCells - left.newCells ||
      left.center.row - right.center.row ||
      left.center.col - right.center.col,
  )
}