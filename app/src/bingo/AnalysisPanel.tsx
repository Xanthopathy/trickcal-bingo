import { formatBingoReward, type Position } from '../game'
import type { BingoSession } from './useBingoSession'
import { MIN_MEANINGFUL_COVERAGE_DIFFERENCE, type FullBoardCandidate } from './fullBoardPlanner'
import { PIECE_OPTIONS, positionLabel } from './constants'

type AnalysisPanelProps = Pick<
  BingoSession,
  | 'activePosition'
  | 'commitPlacement'
  | 'dismissedHoverPosition'
  | 'hoveredPosition'
  | 'isPlannerThinking'
  | 'pieceType'
  | 'plannerError'
  | 'recommendation'
  | 'recommendations'
  | 'selectedPosition'
  | 'setDismissedHoverPosition'
  | 'setHoveredPosition'
  | 'shouldSwapForHigherCoverage'
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
  if (Math.abs(coverageDifference) >= MIN_MEANINGFUL_COVERAGE_DIFFERENCE) {
    const direction = coverageDifference > 0 ? 'more' : 'fewer'
    return `After ${candidate.horizonDraws} future draws, this projects ${Math.abs(coverageDifference).toFixed(1)} ${direction} covered tiles than ${comparisonName}.`
  }

  const bingoDifference = candidate.projectedBingos - comparison.projectedBingos
  if (Math.abs(bingoDifference) >= 0.5) {
    const direction = bingoDifference > 0 ? 'more' : 'fewer'
    return `Projected tile coverage is effectively tied; this projects ${Math.abs(bingoDifference).toFixed(1)} ${direction} completed bingos than ${comparisonName}.`
  }

  const gapDifference = candidate.projectedGapCount - comparison.projectedGapCount
  if (Math.abs(gapDifference) >= 1) {
    const direction = gapDifference < 0 ? 'fewer' : 'more'
    return `Projected coverage is effectively tied; this leaves ${Math.abs(gapDifference).toFixed(1)} ${direction} enclosed empty gaps than ${comparisonName}.`
  }

  return `These moves are too close to distinguish in ${candidate.sampleCount} sampled sequences. Treat them as alternatives, not a proven ranking.`
}

export function AnalysisPanel({ session }: { session: AnalysisPanelProps }) {
  const {
    activePosition,
    commitPlacement,
    dismissedHoverPosition,
    pieceType,
    isPlannerThinking,
    plannerError,
    recommendation,
    recommendations,
    selectedPosition,
    setDismissedHoverPosition,
    setHoveredPosition,
    shouldSwapForHigherCoverage,
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
  const alternativesAreNearTied = recommendations.length > 1 &&
    recommendations.slice(1).every((candidate) =>
      Math.abs(candidate.projectedCoverage - recommendations[0].projectedCoverage) < MIN_MEANINGFUL_COVERAGE_DIFFERENCE &&
      Math.abs(candidate.projectedBingos - recommendations[0].projectedBingos) < 0.5 &&
      Math.abs(candidate.projectedGapCount - recommendations[0].projectedGapCount) < 1,
    )
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
  const storedCoverageDifference = recommendation && storedRecommendation
    ? storedRecommendation.projectedCoverage - recommendation.projectedCoverage
    : 0

  return (
    <aside className="analysis-column board-analysis" aria-label="Board analysis">
      <section className="recommendation-section" aria-live="polite">
        <div className="panel-heading recommendation-heading">
          <div>
            <p className="section-kicker">SAMPLED LOOKAHEAD</p>
            <h2>Recommended placement</h2>
          </div>
          <span className="recommendation-tag">{isPlannerThinking ? 'SEARCHING' : 'COVERAGE FIRST'}</span>
        </div>

        {isPlannerThinking ? (
          <p className="empty-note">Searching sampled future draws for a strong coverage move…</p>
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
              <span className="move-score">Score {recommendation.recommendationScore.toFixed(1)}</span>
            </button>
          </>
        ) : (
          <p className="empty-note">{pieceType ? 'No full-board plan is available for this position.' : 'Select a piece in hand to calculate a full-board plan.'}</p>
        )}

        {recommendation && <p className="score-legend">Scores compare this piece’s placements: projected coverage dominates, with bingos and gaps as tie-breakers. 100 is the top score shown, not a probability.</p>}

        {recommendations.length > 1 && (
          <div className="alternatives">
            <p className="alternatives-title">{alternativesAreNearTied ? 'Near-tied board layouts' : 'Alternative candidates'}</p>
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
                  <span className="alternative-rank">0{index + 2} · {candidate.recommendationScore.toFixed(1)}</span>
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
            ? pieceType === slotPieceType
              ? `Both available pieces are ${pieceName(pieceType)}; swapping will not change the move options.`
              : Math.abs(storedCoverageDifference) < MIN_MEANINGFUL_COVERAGE_DIFFERENCE
                ? `No clear coverage reason to swap ${pieceName(pieceType)} for ${pieceName(slotPieceType)}; their estimates are too close to distinguish over ${recommendation.horizonDraws} draws.`
                : shouldSwapForHigherCoverage
                  ? `Swap to stored ${pieceName(slotPieceType)}: projects ${storedCoverageDifference.toFixed(1)} more covered tiles over the next ${recommendation.horizonDraws} draws.`
                  : `Keep ${pieceName(pieceType)} in hand: projects ${Math.abs(storedCoverageDifference).toFixed(1)} more covered tiles than ${pieceName(slotPieceType)} over the next ${recommendation.horizonDraws} draws.`
            : 'Add a piece to storage to compare full-board plans for both available pieces.'}
        </div>
      </section>
    </aside>
  )
}