import {
  BINGO_LINES,
  BOARD_SIZE,
  formatBingoReward,
  getPlacementCenter,
} from '../game'
import type { BingoSession } from './useBingoSession'
import { positionLabel } from './constants'

type BoardPanelProps = Pick<
  BingoSession,
  | 'activePosition'
  | 'board'
  | 'boardGridRef'
  | 'clickBoardPosition'
  | 'completedLines'
  | 'coveredCount'
  | 'history'
  | 'isRecommendationPreview'
  | 'pieceType'
  | 'previewCells'
  | 'skipThreshold'
  | 'slotPieceType'
  | 'startNewBoard'
  | 'undo'
>

export function BoardPanel({ session }: { session: BoardPanelProps }) {
  const {
    activePosition,
    board,
    boardGridRef,
    clickBoardPosition,
    completedLines,
    coveredCount,
    history,
    isRecommendationPreview,
    pieceType,
    previewCells,
    skipThreshold,
    slotPieceType,
    startNewBoard,
    undo,
  } = session

  const completedLineIds = new Set(completedLines.map((line) => line.id))
  const rowLines = BINGO_LINES.filter((line) => line.kind === 'row')
  const columnLines = BINGO_LINES.filter((line) => line.kind === 'column')
  const diagonalLines = BINGO_LINES.filter((line) => line.kind === 'diagonal')

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
        <span className="board-corner" aria-hidden="true" />
        {'ABCDEFG'.split('').map((letter, index) => (
          <span className="board-file-label" key={letter} style={{ gridRow: 1, gridColumn: index + 2 }}>
            {letter}
          </span>
        ))}
        <div className="board-grid" ref={boardGridRef} role="grid" aria-label="7 by 7 bingo board" style={{ gridRow: '2 / span 7', gridColumn: '2 / span 7' }}>
          {board.map((row, rowIndex) =>
            row.map((covered, colIndex) => {
              const cellPosition = { row: rowIndex, col: colIndex }
              const placementCenter = pieceType
                ? getPlacementCenter(pieceType, cellPosition)
                : cellPosition
              const key = `${rowIndex}-${colIndex}`
              const preview = previewCells.get(key)
              const isPlacementAnchor =
                activePosition?.row === rowIndex &&
                activePosition.col === colIndex
              const cellClass = [
                'board-cell',
                covered ? 'is-covered' : '',
                preview === false
                  ? isRecommendationPreview ? 'is-suggested-new' : 'is-preview-new'
                  : '',
                preview === true
                  ? isRecommendationPreview ? 'is-suggested-overlap' : 'is-preview-overlap'
                  : '',
                isPlacementAnchor ? 'is-recommendation-anchor' : '',
              ].filter(Boolean).join(' ')

              return (
                <button
                  className={cellClass}
                  type="button"
                  role="gridcell"
                  key={key}
                  aria-label={`${positionLabel(cellPosition)}${covered ? ', covered' : ', empty'}`}
                  title={positionLabel(cellPosition)}
                  onClick={() => clickBoardPosition(placementCenter)}
                />
              )
            }),
          )}
        </div>
        {Array.from({ length: BOARD_SIZE }, (_, index) => (
          <span className="board-rank-label" key={index} style={{ gridRow: index + 2, gridColumn: 1 }}>
            {index + 1}
          </span>
        ))}
        {rowLines.map((line, index) => (
          <div
            className={`board-reward-cell ${completedLineIds.has(line.id) ? 'is-complete' : ''}`}
            key={line.id}
            role="note"
            aria-label={`${line.label} reward: ${formatBingoReward(line.reward)}`}
            title={`${line.label}: ${formatBingoReward(line.reward)}`}
            style={{ gridRow: index + 2, gridColumn: 9 }}
          >
            {formatBingoReward(line.reward)}
          </div>
        ))}
        <span className="board-corner" style={{ gridRow: 9, gridColumn: 1 }} aria-hidden="true" />
        {columnLines.map((line, index) => (
          <div
            className={`board-reward-cell ${completedLineIds.has(line.id) ? 'is-complete' : ''}`}
            key={line.id}
            role="note"
            aria-label={`${line.label} reward: ${formatBingoReward(line.reward)}`}
            title={`${line.label}: ${formatBingoReward(line.reward)}`}
            style={{ gridRow: 9, gridColumn: index + 2 }}
          >
            {formatBingoReward(line.reward)}
          </div>
        ))}
        <div
          className={`board-reward-cell board-diagonal-reward ${completedLineIds.has(diagonalLines[1].id) ? 'is-complete' : ''}`}
          role="note"
          aria-label={`${diagonalLines[1].label} reward: ${formatBingoReward(diagonalLines[1].reward)}`}
          title={`${diagonalLines[1].label}: ${formatBingoReward(diagonalLines[1].reward)}`}
          style={{ gridRow: 1, gridColumn: 9 }}
        >
          {formatBingoReward(diagonalLines[1].reward)}
        </div>
        <div
          className={`board-reward-cell board-diagonal-reward ${completedLineIds.has(diagonalLines[0].id) ? 'is-complete' : ''}`}
          role="note"
          aria-label={`${diagonalLines[0].label} reward: ${formatBingoReward(diagonalLines[0].reward)}`}
          title={`${diagonalLines[0].label}: ${formatBingoReward(diagonalLines[0].reward)}`}
          style={{ gridRow: 9, gridColumn: 9 }}
        >
          {formatBingoReward(diagonalLines[0].reward)}
        </div>
      </div>

      <div className="board-legend" aria-label="Board legend">
        <span><i className="legend-covered" /> Covered</span>
        <span><i className="legend-new" /> Selected</span>
        <span><i className="legend-suggested" /> Recommendation</span>
        <span><i className="legend-overlap" /> Overlap</span>
      </div>
      <p className="board-hint">Click to preview · Click again to place</p>
      <p className="board-scroll-note">Scroll over the board to cycle the hand piece.</p>
      <div className="control-note">
        <span>Hotkeys: 1–5 piece · 7–0 candidates</span>
        <span>S swap · Z undo · R restart · P place · Esc clear preview</span>
      </div>
    </section>
  )
}