import { formatBingoReward, type Position } from '../game'
import type { BingoSession } from './useBingoSession'
import { PIECE_OPTIONS, positionLabel } from './constants'

type AnalysisPanelProps = Pick<
  BingoSession,
  | 'activePosition'
  | 'commitPlacement'
  | 'completedLines'
  | 'dismissedHoverPosition'
  | 'hoveredPosition'
  | 'pieceType'
  | 'progressLines'
  | 'recommendation'
  | 'recommendations'
  | 'selectedPosition'
  | 'setDismissedHoverPosition'
  | 'setHoveredPosition'
  | 'shouldSwapForHigherAdaptiveValue'
  | 'slotPieceType'
  | 'storedRecommendation'
  | 'toggleRecommendation'
>

const samePosition = (left: Position | null, right: Position) =>
  left?.row === right.row && left.col === right.col

const pieceName = (pieceType: typeof PIECE_OPTIONS[number]['type'] | null) =>
  PIECE_OPTIONS.find((option) => option.type === pieceType)?.name

export function AnalysisPanel({ session }: { session: AnalysisPanelProps }) {
  const {
    activePosition,
    commitPlacement,
    completedLines,
    dismissedHoverPosition,
    pieceType,
    progressLines,
    recommendation,
    recommendations,
    selectedPosition,
    setDismissedHoverPosition,
    setHoveredPosition,
    shouldSwapForHigherAdaptiveValue,
    slotPieceType,
    storedRecommendation,
    toggleRecommendation,
  } = session

  const chooseForPreview = (center: Position) => {
    setDismissedHoverPosition(null)
    setHoveredPosition(center)
  }
  const clearPreview = () => {
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
  }

  return (
    <aside className="analysis-column board-analysis" aria-label="Board analysis">
      <section className="recommendation-section" aria-live="polite">
        <div className="panel-heading recommendation-heading">
          <div>
            <p className="section-kicker">ADAPTIVE HEURISTIC</p>
            <h2>Recommended placement</h2>
          </div>
          <span className="recommendation-tag">TOP PICK</span>
        </div>

        {recommendation && pieceType ? (
          <>
            <button
              className={`recommended-move ${samePosition(selectedPosition, recommendation.center) ? 'is-selected' : ''} ${samePosition(dismissedHoverPosition, recommendation.center) ? 'is-hover-dismissed' : ''}`}
              type="button"
              aria-label={`Select recommended placement ${positionLabel(recommendation.center)}`}
              onMouseEnter={() => chooseForPreview(recommendation.center)}
              onMouseLeave={clearPreview}
              onFocus={() => chooseForPreview(recommendation.center)}
              onBlur={clearPreview}
              onClick={() => toggleRecommendation(recommendation.center)}
            >
              <strong>{positionLabel(recommendation.center)}</strong>
              <p>{recommendation.explanation}</p>
            </button>
            <p className="future-explanation">{recommendation.futureExplanation}</p>
            <div className="move-facts">
              <div><strong>{recommendation.newCells}</strong><span>new tiles</span></div>
              <div><strong>{recommendation.overlaps}</strong><span>overlaps</span></div>
              <div><strong>{recommendation.completedLines.length}</strong><span>bingos</span></div>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => commitPlacement(activePosition)}
              disabled={!activePosition}
            >
              Place at {activePosition ? positionLabel(activePosition) : '—'}
              <span aria-hidden="true">→</span>
            </button>
          </>
        ) : (
          <p className="empty-note">Select a piece in hand to calculate recommendations.</p>
        )}

        {recommendations.length > 1 && (
          <div className="alternatives">
            <p className="alternatives-title">Alternative candidates</p>
            <div className="alternative-candidates">
              {recommendations.slice(1, 4).map((candidate, index) => (
                <button
                  className={`alternative-row ${samePosition(selectedPosition, candidate.center) ? 'is-selected' : ''} ${samePosition(dismissedHoverPosition, candidate.center) ? 'is-hover-dismissed' : ''}`}
                  type="button"
                  key={`${candidate.center.row}-${candidate.center.col}`}
                  onMouseEnter={() => chooseForPreview(candidate.center)}
                  onMouseLeave={clearPreview}
                  onFocus={() => chooseForPreview(candidate.center)}
                  onBlur={clearPreview}
                  onClick={() => toggleRecommendation(candidate.center)}
                >
                  <span className="alternative-rank">0{index + 2}</span>
                  <span className="alternative-position">{positionLabel(candidate.center)}</span>
                  <span className="alternative-summary">
                    {candidate.completedLines.length > 0
                      ? `${candidate.completedLines.length} bingo${candidate.completedLines.length > 1 ? 's' : ''}`
                      : `+${candidate.newCells} tiles`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="swap-advice" aria-live="polite">
          {pieceType && slotPieceType && storedRecommendation && recommendation
            ? shouldSwapForHigherAdaptiveValue
              ? `Swap to stored ${pieceName(slotPieceType)} for a better current-and-next-turn outlook; keep ${pieceName(pieceType)} available in storage.`
              : `Keep ${pieceName(pieceType)} in hand for a better current-and-next-turn outlook; preserve ${pieceName(slotPieceType)} in storage.`
            : 'Choose a hand piece and store a second piece to compare moves with a drop-rate-weighted next turn.'}
        </div>
      </section>

      <section className="lines-section">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">BINGO LINES</p>
            <h2>{completedLines.length > 0 ? `${completedLines.length} completed` : 'Line progress'}</h2>
          </div>
          <span className="line-count">{completedLines.length}/16</span>
        </div>
        {completedLines.length > 0 && (
          <ul className="completed-list">
            {completedLines.map((line) => (
              <li key={line.id}>
                <span>{line.label}</span>
                <strong>{formatBingoReward(line.reward)}</strong>
              </li>
            ))}
          </ul>
        )}
        {progressLines.length > 0 ? (
          <ul className="progress-list">
            {progressLines.map(({ line, count }) => (
              <li key={line.id}>
                <div><span>{line.label}</span><span>{count}/7</span></div>
                <span className="line-progress-track"><i style={{ width: `${(count / 7) * 100}%` }} /></span>
              </li>
            ))}
          </ul>
        ) : completedLines.length === 0 ? (
          <p className="empty-note">No line progress yet.</p>
        ) : null}
      </section>
    </aside>
  )
}