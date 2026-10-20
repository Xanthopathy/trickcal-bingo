import type { Position } from '../game'
import type { BingoSession } from './useBingoSession'
import { MIN_MEANINGFUL_COVERAGE_DIFFERENCE, type FullBoardCandidate } from './fullBoardPlanner'
import { PIECE_OPTIONS, positionLabel } from './constants'

type AnalysisPanelProps = Pick<
  BingoSession,
  | 'activePosition'
  | 'coveredCount'
  | 'customPlacement'
  | 'customPlacementError'
  | 'isCustomPlacementThinking'
  | 'commitPlacement'
  | 'dismissedHoverPosition'
  | 'hoveredPosition'
  | 'isPlannerThinking'
  | 'pieceType'
  | 'plannerBenchmark'
  | 'plannerError'
  | 'recommendation'
  | 'recommendations'
  | 'selectedPosition'
  | 'setDismissedHoverPosition'
  | 'setHoveredPosition'
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
  if (!comparison) return 'No comparison available.'

  const valueDifference = candidate.recommendationScore - comparison.recommendationScore
  if (Math.abs(valueDifference) >= 0.001) {
    const direction = valueDifference > 0 ? '+' : ''
    return `${direction}${valueDifference.toFixed(3)} move value vs ${isTopPick ? 'next best' : 'top pick'}`
  }

  const deltas: string[] = []
  const priorityBingoDifference =
    candidate.benchmark.averagePriorityBingos - comparison.benchmark.averagePriorityBingos
  if (Math.abs(priorityBingoDifference) >= 0.1) deltas.push(`${priorityBingoDifference > 0 ? '+' : ''}${priorityBingoDifference.toFixed(1)} priority`)

  const benchmarkBingoDifference = candidate.benchmark.averageBingos - comparison.benchmark.averageBingos
  if (Math.abs(benchmarkBingoDifference) >= 0.1) deltas.push(`${benchmarkBingoDifference > 0 ? '+' : ''}${benchmarkBingoDifference.toFixed(1)} total`)

  const newTileDifference = candidate.newCells - comparison.newCells
  if (newTileDifference !== 0) deltas.push(`${newTileDifference > 0 ? '+' : ''}${newTileDifference} tiles now`)

  const coinChanceDifference =
    candidate.benchmark.chanceAllCoinRewards - comparison.benchmark.chanceAllCoinRewards
  if (Math.abs(coinChanceDifference) >= 0.05) deltas.push(`${coinChanceDifference > 0 ? '+' : ''}${Math.round(coinChanceDifference * 100)}pp coins`)

  const certificateChanceDifference =
    candidate.benchmark.chanceCertificateReward - comparison.benchmark.chanceCertificateReward
  if (Math.abs(certificateChanceDifference) >= 0.05) deltas.push(`${certificateChanceDifference > 0 ? '+' : ''}${Math.round(certificateChanceDifference * 100)}pp cert`)

  const comparisonLabel = isTopPick ? 'next best' : 'top pick'
  return deltas.length > 0
    ? `${deltas.slice(0, 3).join(' · ')} vs ${comparisonLabel}`
    : 'Similar checkpoint outcomes.'
}

const getSwapAdvice = (
  handCandidate: FullBoardCandidate,
  storedCandidate: FullBoardCandidate,
  handName: string,
  storedName: string,
) => {
  if (handName === storedName) {
    return `Both pieces are ${handName}.`
  }

  const scoreDifference = storedCandidate.recommendationScore - handCandidate.recommendationScore
  if (scoreDifference > 0) {
    return `Swap to ${storedName}: +${scoreDifference.toFixed(3)} move value.`
  }
  if (scoreDifference < 0) {
    return `Keep ${handName}: +${Math.abs(scoreDifference).toFixed(3)} move value.`
  }
  return `Move values tie at ${handCandidate.recommendationScore.toFixed(3)}; keep ${handName} in hand.`
}

export function AnalysisPanel({ session }: { session: AnalysisPanelProps }) {
  const {
    activePosition,
    customPlacement,
    customPlacementError,
    isCustomPlacementThinking,
    coveredCount,
    commitPlacement,
    dismissedHoverPosition,
    pieceType,
    plannerBenchmark,
    isPlannerThinking,
    plannerError,
    recommendation,
    recommendations,
    selectedPosition,
    setDismissedHoverPosition,
    setHoveredPosition,
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
      Math.abs(candidate.projectedGapCount - recommendations[0].projectedGapCount) < 1 &&
      candidate.immediatePriorityBingos === recommendations[0].immediatePriorityBingos &&
      candidate.immediatePriorityProgress === recommendations[0].immediatePriorityProgress &&
      candidate.newCells === recommendations[0].newCells,
    )
  const activeCandidate = isCustomPosition
    ? customPlacement && sameCandidate(customPlacement, activePosition)
      ? customPlacement
      : null
    : recommendations[selectedCandidateIndex] ?? null
  const comparisonCandidate = isCustomPosition
    ? recommendations[0]
    : selectedCandidateIndex === 0
      ? recommendations[1]
      : recommendations[0]
  const activeIsTopPick = !isCustomPosition && selectedCandidateIndex === 0
  const immediateBingoText = activeCandidate
    ? activeCandidate.completedLines.length > 0
      ? `Completes ${activeCandidate.completedLines.length} bingo${activeCandidate.completedLines.length === 1 ? '' : 's'}`
      : 'No immediate bingo'
    : null
  return (
    <aside className="analysis-column board-analysis" aria-label="Board analysis">
      <section className="recommendation-section" aria-live="polite">
        <div className="panel-heading recommendation-heading">
          <div>
            <p className="section-kicker">FULL-BOARD ROLLOUTS</p>
            <h2>Recommended placement</h2>
          </div>
          <span className="recommendation-tag">{isPlannerThinking ? 'SEARCHING' : 'MOVE VALUE'}</span>
        </div>

        {isPlannerThinking ? (
          <p className="empty-note">Simulating complete boards from each candidate move…</p>
        ) : plannerError ? (
          <p className="empty-note" role="alert">{plannerError}</p>
        ) : recommendation && pieceType ? (
          <>
            <div className="recommendation-actions">
              <button
                className={`recommended-move ${samePosition(selectedPosition, recommendation.center) ? 'is-selected' : ''} ${samePosition(dismissedHoverPosition, recommendation.center) ? 'is-hover-dismissed' : ''}`}
                type="button"
                aria-label={`Select recommended placement ${positionLabel(recommendation.center)}, move value ${recommendation.recommendationScore.toFixed(3)} out of 100`}
                onMouseEnter={() => chooseForPreview(recommendation.center)}
                onMouseLeave={clearPreview}
                onFocus={() => chooseForPreview(recommendation.center)}
                onBlur={clearPreview}
                onClick={() => toggleRecommendation(recommendation.center)}
              >
                <strong>{positionLabel(recommendation.center)}</strong>
                <span className="move-score">
                  <strong>{recommendation.recommendationScore.toFixed(3)}</strong>
                  <small>move value / 100</small>
                </span>
              </button>
              <button
                className="primary-button recommendation-place"
                type="button"
                onClick={() => commitPlacement(activePosition)}
                disabled={!activePosition}
              >
                Place at {activePosition ? positionLabel(activePosition) : '—'}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </>
        ) : (
          <p className="empty-note">{pieceType ? 'No full-board plan is available for this position.' : 'Select a piece in hand to calculate a full-board plan.'}</p>
        )}

        {recommendation && <p className="score-legend">Blends stop outcomes and move cost · {plannerBenchmark}-tile checkpoint contributes until reached</p>}

        {recommendations.length > 1 && (
          <div className="alternatives">
            <p className="alternatives-title">{alternativesAreNearTied ? 'Near-tied board layouts' : 'Alternative candidates'}</p>
            <div className="alternative-candidates">
              {recommendations.slice(1, 4).map((candidate) => (
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
                  <span className="alternative-position">{positionLabel(candidate.center)}</span>
                  <span className="alternative-rank">{candidate.recommendationScore.toFixed(3)}</span>
                  <span className="alternative-summary">
                    {candidate.completedLines.length > 0
                      ? `Completes ${candidate.completedLines.length} bingo${candidate.completedLines.length === 1 ? '' : 's'}`
                      : `+${candidate.newCells} tiles`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {recommendation && pieceType && (
          <div className="candidate-explanation" aria-live="polite">
            <div className="candidate-explanation-heading">
              <p className="section-kicker">MOVE ANALYSIS</p>
              <strong>{activeCandidate
                ? `${isCustomPosition ? 'Custom' : selectedCandidateIndex === 0 ? 'Top pick' : `Option ${selectedCandidateIndex + 1}`} · ${positionLabel(activeCandidate.center)}`
                : 'Custom board position'}</strong>
            </div>
            {activeCandidate ? (
              <>
                <p>{candidateComparison(activeCandidate, comparisonCandidate, activeIsTopPick)}</p>
                <dl className="candidate-stats">
                  <div><dt>At stop</dt><dd>{activeCandidate.projectedCoverage.toFixed(1)} tiles · {activeCandidate.projectedPriorityBingos.toFixed(1)} priority · {activeCandidate.projectedBingos.toFixed(1)} total</dd></div>
                  <div><dt>Now</dt><dd>+{activeCandidate.newCells} {activeCandidate.newCells === 1 ? 'tile' : 'tiles'} · {immediateBingoText}</dd></div>
                  <div><dt>To stop</dt><dd>{activeCandidate.projectedTurnsToStop.toFixed(1)} turns</dd></div>
                  {coveredCount < plannerBenchmark ? (
                    <div><dt>At {plannerBenchmark} tiles</dt><dd>{Math.round(activeCandidate.benchmark.chanceAllCoinRewards * 100)}% all coins · {Math.round(activeCandidate.benchmark.chanceCertificateReward * 100)}% certificate</dd></div>
                  ) : (
                    <div><dt>Board shape</dt><dd>{activeCandidate.projectedPriorityProgress.toFixed(1)} core-line tiles · {activeCandidate.projectedGapCount.toFixed(1)} trapped gaps</dd></div>
                  )}
                </dl>
              </>
            ) : (
              <p>{customPlacementError ?? (isCustomPlacementThinking ? 'Analyzing custom placement…' : 'Click a board position to analyze it.')}</p>
            )}
          </div>
        )}

        <div className="swap-advice" aria-live="polite">
          {pieceType && slotPieceType && storedRecommendation && recommendation
            ? getSwapAdvice(
              recommendation,
              storedRecommendation,
              pieceName(pieceType) ?? 'Current piece',
              pieceName(slotPieceType) ?? 'Stored piece',
            )
            : 'Add a piece to storage to compare full-board plans for both available pieces.'}
        </div>
      </section>
    </aside>
  )
}