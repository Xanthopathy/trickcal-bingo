import { BOARD_SIZE, PIECES, type PieceType } from '../game'

export function PieceIcon({ pieceType }: { pieceType: PieceType }) {
  return (
    <span className={`piece-icon-grid piece-icon-${pieceType}`} aria-hidden="true">
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
        const row = Math.floor(index / BOARD_SIZE) - 3
        const col = (index % BOARD_SIZE) - 3
        const filled = PIECES[pieceType].some(
          (offset) => offset.row === row && offset.col === col,
        )

        return (
          <i
            className={filled ? 'piece-icon-cell is-filled' : 'piece-icon-cell'}
            key={index}
          />
        )
      })}
    </span>
  )
}