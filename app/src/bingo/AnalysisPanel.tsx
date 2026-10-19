import { formatBingoReward, type Position } from '../game'
import type { BingoSession } from './useBingoSession'
import type { FullBoardCandidate } from './fullBoardPlanner'
import { PIECE_OPTIONS, positionLabel } from './constants'

type AnalysisPanelProps = Pick<
  BingoSession,
  | 'activePosition'
  | 'commitPlacement'
  | 'completedLines'
  | 'dismissedHoverPosition'
  | 'hoveredPosition'
  | 'isPlannerThinking'
  | 'pieceType'
  | 'plannerError'
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

const sameCandidate = (candidate: FullBoardCandidate, position: Position | null) =>
  position !== null && samePosition(position, candidate.center)

const candidateComparison = (
  candidate: FullBoardCandidate,
  comparison: FullBoardCandidate | undefined,
  isTopPick: boolean,
) => {
  if (!comparison) return 'No other evaluated move is available for comparison.'

  const coverageDifference = candidate.projectedCoverage - comparison.projectedCoverage
  const comparisonName = isTopPick ? 'the next-best move' : 'the top recommendation'
  if (Math.abs(coverageDifference) >= 0.1) {
    const direction = coverageDifference > 0 ? 'more' : 'fewer'
    return `After ${candidate.horizonDraws} future draws, this projects ${Math.abs(coverageDifference).toFixed(1)} ${direction} covered tiles than ${comparisonName}.`
  }

  const bingoDifference = candidate.projectedBingos - comparison.projectedBingos
  if (Math.abs(bingoDifference) >= 0.2) {
    const direction = bingoDifference > 0 ? 'more' : 'fewer'
    return `Projected tile coverage is effectively tied; this projects ${Math.abs(bingoDifference).toFixed(1)} ${direction} completed bingos than ${comparisonName}.`
  }

  const gapDifference = candidate.projectedGapCount - comparison.projectedGapCount
  if (Math.abs(gapDifference) >= 0.2) {
    const direction = gapDifference < 0 ? 'fewer' : 'more'
    return `Projected coverage is effectively tied; this leaves ${Math.abs(gapDifference).toFixed(1)} ${direction} enclosed empty gaps than ${comparisonName}.`
  }

  return `These moves are effectively tied across ${candidate.sampleCount} sampled sequences. Use the board preview to choose between their layouts.`
}

export function AnalysisPanel({ session }: { session: AnalysisPanelProps }) {
  const {
    activePosition,
    commitPlacement,
    completedLines,
    dismissedHoverPosition,
    pieceType,
    isPlannerThinking,
    plannerError,
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
  const activeCandidateIndex = recommendations.findIndex((candidate) =>
    sameCandidate(candidate, activePosition),
  )
  const isCustomPosition = activePosition !== null && activeCandidateIndex < 0
  const selectedCandidateIndex = activeCandidateIndex < 0 ? 0 : activeCandidateIndex
  const activeCandidate = isCustomPosition
    ? null
    : recommendations[selectedCandidateIndex] ?? null
  const comparisonCandidate = selectedCandidateIndex === 0
    ? recommendations[1]
    : recommendations[0]
  const immediateBingoText = activeCandidate
    ? activeCandidate.completedLines.length > 0
      ? `Completes ${activeCandidate.completedLines.map((line) => `${line.label} (${formatBingoReward(line.reward)})`).join('; ')}.`
      : 'Does not complete a bingo immediately.'
    : null

  return (
    <aside className="analysis-column board-analysis" aria-label="Board analysis">
      <section className="recommendation-section" aria-live="polite">
        <div className="panel-heading recommendation-heading">
          <div>
            <p className="section-kicker">FULL-BOARD SEARCH</p>
            <h2>Recommended placement</h2>
          </div>
          <span className="recommendation-tag">{isPlannerThinking ? 'SEARCHING' : 'COVERAGE FIRST'}</span>
        </div>

        {isPlannerThinking ? (
          <p className="empty-note">Searching future draws for the strongest board-filling plan…</p>
        ) : plannerError ? (
          <p className="empty-note" role="alert">{plannerError}</p>
        ) : recommendation && pieceType ? (
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
              <p>Top projected board fill</p>
            </button>
          </>
        ) : (
          <p className="empty-note">{pieceType ? 'No full-board plan is available for this position.' : 'Select a piece in hand to calculate a full-board plan.'}</p>
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
                      ? `Completes ${candidate.completedLines.length} bingo${candidate.completedLines.length === 1 ? '' : 's'}`
                      : `+${candidate.newCells} tiles now`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {recommendation && pieceType && (
          <div className="candidate-explanation" aria-live="polite">
            <div className="candidate-explanation-heading">
              <p className="section-kicker">WHY THIS MOVE</p>
              <strong>{activeCandidate
                ? `${selectedCandidateIndex === 0 ? 'Top pick' : `Option ${selectedCandidateIndex + 1}`} · ${positionLabel(activeCandidate.center)}`
                : 'Custom board position'}</strong>
            </div>
            {activeCandidate ? (
              <>
                <p>{candidateComparison(activeCandidate, comparisonCandidate, selectedCandidateIndex === 0)}</p>
                <p>{`Covers ${activeCandidate.newCells} previously empty ${activeCandidate.newCells === 1 ? 'tile' : 'tiles'} now. ${immediateBingoText}`}</p>
                <small>Estimate from {activeCandidate.sampleCount} shared draw samples over the next {activeCandidate.horizonDraws} draws.</small>
              </>
            ) : (
              <p>Sampled comparisons are available for the recommended move and alternatives listed above.</p>
            )}
            <button
              className="primary-button"
              type="button"
              onClick={() => commitPlacement(activePosition)}
              disabled={!activePosition}
            >
              Place at {activePosition ? positionLabel(activePosition) : '—'}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}

        <div className="swap-advice" aria-live="polite">
          {pieceType && slotPieceType && storedRecommendation && recommendation
            ? shouldSwapForHigherAdaptiveValue
              ? `Swap to stored ${pieceName(slotPieceType)} for higher projected coverage (${storedRecommendation.projectedCoverage.toFixed(1)} vs. ${recommendation.projectedCoverage.toFixed(1)} tiles).`
              : `Keep ${pieceName(pieceType)} in hand; it projects ${recommendation.projectedCoverage.toFixed(1)} covered tiles vs. ${storedRecommendation.projectedCoverage.toFixed(1)} with ${pieceName(slotPieceType)}.`
            : 'Add a piece to storage to compare full-board plans for both available pieces.'}
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