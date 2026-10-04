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
  pieceType: PieceType,
  center: Position,
): boolean =>
  PIECES[pieceType].every((offset) => {
    const row = center.row + offset.row
    const col = center.col + offset.col

    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
  })

export const placePiece = (
  board: Board,
  pieceType: PieceType,
  center: Position,
): Board => {
  if (!canPlacePiece(pieceType, center)) {
    throw new RangeError("Piece placement is outside the board")
  }

  const nextBoard = board.map((row) => [...row])

  for (const offset of PIECES[pieceType]) {
    const row = center.row + offset.row
    const col = center.col + offset.col
    nextBoard[row][col] = true
  }

  return nextBoard
}