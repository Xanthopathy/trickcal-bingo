import { BOARD_SIZE, type PieceType } from '../game'
import type { BingoSession } from './useBingoSession'
import { PieceIcon } from './PieceIcon'
import { PIECE_OPTIONS } from './constants'

type PieceControlsProps = Pick<
  BingoSession,
  | 'completedLines'
  | 'coveredCount'
  | 'pieceType'
  | 'selectPiece'
  | 'skipThreshold'
  | 'slotPieceType'
  | 'swapSlot'
>

const pieceName = (pieceType: PieceType | null) =>
  PIECE_OPTIONS.find((option) => option.type === pieceType)?.name

export function PieceControls({ session }: { session: PieceControlsProps }) {
  const {
    completedLines,
    coveredCount,
    pieceType,
    selectPiece,
    skipThreshold,
    slotPieceType,
    swapSlot,
  } = session

  return (
    <aside className="analysis-column piece-controls" aria-label="Piece controls">
      <section className="analysis-heading" id="top">
        <div>
          <p className="eyebrow">BOARD ANALYSIS</p>
          <h1>Current run</h1>
        </div>
        <div className="quick-stats" aria-label="Board summary">
          <div className="quick-stat">
            <strong>{coveredCount}<span> / 49</span></strong>
            <span>tiles covered</span>
          </div>
          <div className="quick-stat">
            <strong>{completedLines.length}<span> / 16</span></strong>
            <span>bingos</span>
          </div>
        </div>
      </section>

      <div
        className="skip-progress"
        aria-label={`${coveredCount} of ${BOARD_SIZE * BOARD_SIZE} tiles covered; skip threshold at ${skipThreshold}`}
      >
        <div className="skip-progress-track">
          <span style={{ width: `${Math.min(coveredCount / (BOARD_SIZE * BOARD_SIZE), 1) * 100}%` }} />
          <i style={{ left: `${(skipThreshold / (BOARD_SIZE * BOARD_SIZE)) * 100}%` }} />
        </div>
        <div className="skip-progress-labels">
          <span>Skip at {skipThreshold}</span>
          <span>{coveredCount} / {BOARD_SIZE * BOARD_SIZE}</span>
        </div>
      </div>

      <section className="piece-section">
        <div className="panel-heading">
          <h2>Piece in hand</h2>
          {pieceType && <span className="piece-name">{pieceName(pieceType)}</span>}
        </div>
        <div className="piece-picker" role="group" aria-label="Piece in hand">
          {PIECE_OPTIONS.map((option) => (
            <button
              className={`piece-option piece-${option.type} ${pieceType === option.type ? 'selected' : ''}`}
              type="button"
              key={option.type}
              aria-pressed={pieceType === option.type}
              aria-label={option.name}
              title={option.name}
              onClick={() => selectPiece(option.type)}
            >
              <PieceIcon pieceType={option.type} />
            </button>
          ))}
        </div>
      </section>

      <section className="slot-section">
        <div className="panel-heading">
          <h2>Storage slot</h2>
          <span className="slot-state">{slotPieceType ? 'Occupied' : 'Empty'}</span>
        </div>
        <div className="slot-controls">
          <div className={`slot-display ${slotPieceType ? 'has-piece' : ''}`}>
            {slotPieceType ? (
              <PieceIcon pieceType={slotPieceType} />
            ) : (
              <span className="slot-empty-mark" aria-hidden="true">+</span>
            )}
          </div>
          <div className="slot-copy">
            <strong>{slotPieceType ? pieceName(slotPieceType) : 'No stored piece'}</strong>
            <span>{slotPieceType ? 'Ready to swap into hand' : 'Store the current piece here'}</span>
          </div>
          <button
            className="swap-button"
            type="button"
            disabled={!pieceType && !slotPieceType}
            onClick={swapSlot}
          >
            {!slotPieceType ? 'Store' : pieceType ? 'Swap' : 'Retrieve'}
          </button>
        </div>
      </section>
    </aside>
  )
}