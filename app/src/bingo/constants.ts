import type { PieceType, Position } from '../game'

export const PIECE_OPTIONS: { type: PieceType; name: string }[] = [
  { type: 'plus', name: 'Plus' },
  { type: 'cross', name: 'Cross' },
  { type: 'square', name: '3×3 square' },
  { type: 'horizontal', name: 'Horizontal' },
  { type: 'vertical', name: 'Vertical' },
]

export const positionLabel = ({ row, col }: Position): string =>
  `${'ABCDEFG'[col]}${row + 1}`