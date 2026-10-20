import type { Position } from '../game'
import type { BingoSession } from './useBingoSession'
import { MIN_MEANINGFUL_COVERAGE_DIFFERENCE, type FullBoardCandidate } from './fullBoardPlanner'
import { PIECE_OPTIONS, positionLabel } from './constants'
import { ADAPTIVE_STRATEGIES } from '../simulation/engine'

type AnalysisPanelProps = Pick<
  BingoSession,
  | 'activePosition'
  | 'customPlacement'
  | 'customPlacementError'
  | 'isCustomPlacementThinking'
  | 'commitPlacement'
  | 'dismissedHoverPosition'
  | 'hoveredPosition'
  | 'isPlannerThinking'
  | 'pieceType'
  | 'plannerBenchmark'
  | 'plannerStrategy'
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
  if (!comparison) return 'No comparison available.'

  const priorityBingoDifference =
    candidate.benchmark.averagePriorityBingos - comparison.benchmark.averagePriorityBingos
  if (Math.abs(priorityBingoDifference) >= 0.1) {
    const direction = priorityBingoDifference > 0 ? '+' : ''
    return `${direction}${priorityBingoDifference.toFixed(1)} priority bingos vs ${isTopPick ? 'next best' : 'top pick'}`
  }

  const benchmarkBingoDifference = candidate.benchmark.averageBingos - comparison.benchmark.averageBingos
  if (Math.abs(benchmarkBingoDifference) >= 0.1) {
    const direction = benchmarkBingoDifference > 0 ? '+' : ''
    return `${direction}${benchmarkBingoDifference.toFixed(1)} total bingos vs ${isTopPick ? 'next best' : 'top pick'}`
  }

  const readyDifference = candidate.skipReadyProbability - comparison.skipReadyProbability
  if (Math.abs(readyDifference) >= 0.05) {
    const direction = readyDifference > 0 ? '+' : ''
    return `${direction}${Math.round(readyDifference * 100)}% skip-ready vs ${isTopPick ? 'next best' : 'top pick'}`
  }

  return 'Similar projections.'
}

export function AnalysisPanel({ session }: { session: AnalysisPanelProps }) {
  const {
    activePosition,
    customPlacement,
    customPlacementError,
    isCustomPlacementThinking,
    commitPlacement,
    dismissedHoverPosition,
    pieceType,
    plannerBenchmark,
    plannerStrategy,
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
  const storedCoverageDifference = recommendation && storedRecommendation
    ? storedRecommendation.projectedCoverage - recommendation.projectedCoverage
    : 0

  return (
    <aside className="analysis-column board-analysis" aria-label="Board analysis">
      <section className="recommendation-section" aria-live="polite">
        <div className="panel-heading recommendation-heading">
          <div>
            <p className="section-kicker">FULL-BOARD ROLLOUTS</p>
            <h2>Recommended placement</h2>
          </div>
          <span className="recommendation-tag">{isPlannerThinking ? 'SEARCHING' : `${plannerBenchmark} TILES`}</span>
        </div>

        {isPlannerThinking ? (
          <p className="empty-note">Simulating complete boards from each candidate move…</p>
        ) : plannerError ? (
          <p className="empty-note" role="alert">{plannerError}</p>
        ) : recommendation && pieceType ? (
          <>
            <button
              className={`recommended-move ${samePosition(selectedPosition, recommendation.center) ? 'is-selected' : ''} ${samePosition(dismissedHoverPosition, recommendation.center) ? 'is-hover-dismissed' : ''}`}
              type="button"
              aria-label={`Select recommended placement ${positionLabel(recommendation.center)}, about ${recommendation.benchmark.averagePriorityBingos.toFixed(1)} priority bingos at ${recommendation.benchmark.tiles} tiles`}
              onMouseEnter={() => chooseForPreview(recommendation.center)}
              onMouseLeave={clearPreview}
              onFocus={() => chooseForPreview(recommendation.center)}
              onBlur={clearPreview}
              onClick={() => toggleRecommendation(recommendation.center)}
            >
              <strong>{positionLabel(recommendation.center)}</strong>
              <span className="move-score">~{recommendation.benchmark.averagePriorityBingos.toFixed(1)}</span>
            </button>
          </>
        ) : (
          <p className="empty-note">{pieceType ? 'No full-board plan is available for this position.' : 'Select a piece in hand to calculate a full-board plan.'}</p>
        )}

        {recommendation && <p className="score-legend">{plannerBenchmark} tiles · {ADAPTIVE_STRATEGIES.find(({ id }) => id === plannerStrategy)?.name.replace('Adaptive: ', '') ?? 'selected strategy'}</p>}

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
                  <span className="alternative-rank">0{index + 2} · ~{candidate.benchmark.averagePriorityBingos.toFixed(1)}</span>
                  <span className="alternative-position">{positionLabel(candidate.center)}</span>
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
              <p className="section-kicker">WHY THIS MOVE</p>
              <strong>{activeCandidate
                ? `${isCustomPosition ? 'Custom' : selectedCandidateIndex === 0 ? 'Top pick' : `Option ${selectedCandidateIndex + 1}`} · ${positionLabel(activeCandidate.center)}`
                : 'Custom board position'}</strong>
            </div>
            {activeCandidate ? (
              <>
                <p>{candidateComparison(activeCandidate, comparisonCandidate, activeIsTopPick)}</p>
                <dl className="candidate-stats">
                  <div><dt>{activeCandidate.benchmark.tiles} tiles</dt><dd>~{activeCandidate.benchmark.averagePriorityBingos.toFixed(1)} priority · {activeCandidate.benchmark.averageBingos.toFixed(1)} total</dd></div>
                  <div><dt>Now</dt><dd>+{activeCandidate.newCells} {activeCandidate.newCells === 1 ? 'tile' : 'tiles'} · {immediateBingoText}</dd></div>
                  <div><dt>To stop</dt><dd>{Math.round(activeCandidate.skipReadyProbability * 100)}% ready · {activeCandidate.projectedTurnsToStop.toFixed(1)} turns</dd></div>
                  <div><dt>Rewards / board</dt><dd>{activeCandidate.projectedReward.leaves.toFixed(1)} LV · {activeCandidate.projectedReward.starCandy.toFixed(1)} SC · {activeCandidate.projectedReward.certificates.toFixed(1)} CRT</dd></div>
                </dl>
              </>
            ) : (
              <p>{customPlacementError ?? (isCustomPlacementThinking ? 'Analyzing custom placement…' : 'Click a board position to analyze it.')}</p>
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
                ? `No clear coverage reason to swap ${pieceName(pieceType)} for ${pieceName(slotPieceType)}; their full-board coverage estimates are too close to distinguish.`
                : shouldSwapForHigherCoverage
                  ? `Swap to stored ${pieceName(slotPieceType)}: projects ${storedCoverageDifference.toFixed(1)} more covered tiles at the simulated stop.`
                  : `Keep ${pieceName(pieceType)} in hand: projects ${Math.abs(storedCoverageDifference).toFixed(1)} more covered tiles than ${pieceName(slotPieceType)} at the simulated stop.`
            : 'Add a piece to storage to compare full-board plans for both available pieces.'}
        </div>
      </section>
    </aside>
  )
}