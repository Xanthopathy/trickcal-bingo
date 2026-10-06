import { BOARD_SIZE, getPlacementCenter } from '../game'
import type { BingoSession } from './useBingoSession'
import { positionLabel } from './constants'

type BoardPanelProps = Pick<
  BingoSession,
  | 'board'
  | 'boardGridRef'
  | 'commitPlacement'
  | 'coveredCount'
  | 'cursorPosition'
  | 'history'
  | 'pieceType'
  | 'previewCells'
  | 'recommendation'
  | 'setCursorPosition'
  | 'setHoveredPosition'
  | 'setSelectedPosition'
  | 'skipThreshold'
  | 'slotPieceType'
  | 'startNewBoard'
  | 'undo'
>

export function BoardPanel({ session }: { session: BoardPanelProps }) {
  const {
    board,
    boardGridRef,
    commitPlacement,
    coveredCount,
    cursorPosition,
    history,
    pieceType,
    previewCells,
    recommendation,
    setCursorPosition,
    setHoveredPosition,
    setSelectedPosition,
    skipThreshold,
    slotPieceType,
    startNewBoard,
    undo,
  } = session

  const isAutomaticSuggestion = cursorPosition === null

  return (
    <section className="board-section" aria-label="Bingo board controls">
      <div className="board-toolbar">
        <div>
          <p className="section-kicker">BOARD STATE</p>
          <h2>7 × 7 grid</h2>
        </div>
        <div className="board-actions">
          <button className="text-button" type="button" onClick={undo} disabled={history.length === 0}>
            Undo
          </button>
          <button
            className="text-button skip-button"
            type="button"
            onClick={startNewBoard}
            disabled={coveredCount < skipThreshold}
            title={coveredCount < skipThreshold ? `Available at ${skipThreshold} covered tiles` : 'Start a new board'}
          >
            Skip
          </button>
          <button
            className="text-button restart-button"
            type="button"
            onClick={startNewBoard}
            disabled={coveredCount === 0 && slotPieceType === null && pieceType === 'cross'}
          >
            Restart
          </button>
        </div>
      </div>

      <div className="board-shell">
        <span className="axis-corner" aria-hidden="true" />
        <div className="row-labels" aria-hidden="true">
          {Array.from({ length: BOARD_SIZE }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>
        <div className="board-grid" ref={boardGridRef} role="grid" aria-label="7 by 7 bingo board">
          {board.map((row, rowIndex) =>
            row.map((covered, colIndex) => {
              const cellPosition = { row: rowIndex, col: colIndex }
              const placementCenter = pieceType
                ? getPlacementCenter(pieceType, cellPosition)
                : cellPosition
              const key = `${rowIndex}-${colIndex}`
              const preview = previewCells.get(key)
              const isRecommended =
                recommendation?.center.row === rowIndex &&
                recommendation.center.col === colIndex
              const cellClass = [
                'board-cell',
                covered ? 'is-covered' : '',
                preview === false
                  ? isAutomaticSuggestion ? 'is-suggested-new' : 'is-preview-new'
                  : '',
                preview === true
                  ? isAutomaticSuggestion ? 'is-suggested-overlap' : 'is-preview-overlap'
                  : '',
                isRecommended ? 'is-recommendation-anchor' : '',
              ].filter(Boolean).join(' ')

              return (
                <button
                  className={cellClass}
                  type="button"
                  role="gridcell"
                  key={key}
                  aria-label={`${positionLabel(cellPosition)}${covered ? ', covered' : ', empty'}`}
                  title={positionLabel(cellPosition)}
                  onMouseEnter={() => setCursorPosition(placementCenter)}
                  onMouseLeave={() => setCursorPosition(null)}
                  onFocus={() => setHoveredPosition(placementCenter)}
                  onBlur={() => setHoveredPosition(null)}
                  onClick={() => setSelectedPosition(placementCenter)}
                  onDoubleClick={() => commitPlacement(placementCenter)}
                />
              )
            }),
          )}
        </div>
        <div className="column-labels" aria-hidden="true">
          {'ABCDEFG'.split('').map((letter) => <span key={letter}>{letter}</span>)}
        </div>
      </div>

      <div className="board-legend" aria-label="Board legend">
        <span><i className="legend-covered" /> Covered</span>
        <span><i className="legend-new" /> Selected preview</span>
        <span><i className="legend-suggested" /> Recommendation</span>
        <span><i className="legend-overlap" /> Overlap</span>
      </div>
      <p className="board-hint">Click to preview · Double-click to place</p>
      <p className="board-scroll-note">Scroll over the board to cycle the hand piece.</p>
      <div className="control-note">
        Hotkeys: 1–5 piece · S swap · Z undo · R restart · P place · 7–0 candidates · Esc clear preview
      </div>
    </section>
  )
}