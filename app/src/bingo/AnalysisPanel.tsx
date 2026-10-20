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
  const comparisons = [
    {
      advantage: storedCandidate.benchmark.averagePriorityBingos - handCandidate.benchmark.averagePriorityBingos,
      threshold: 0.1,
      describe: (difference: number) => `${difference.toFixed(1)} priority bingos at ${storedCandidate.benchmark.tiles} tiles`,
    },
    {
      advantage: storedCandidate.benchmark.averageBingos - handCandidate.benchmark.averageBingos,
      threshold: 0.1,
      describe: (difference: number) => `${difference.toFixed(1)} total bingos at ${storedCandidate.benchmark.tiles} tiles`,
    },
    {
      advantage: storedCandidate.benchmark.averageCoveredTiles - handCandidate.benchmark.averageCoveredTiles,
      threshold: 0.5,
      describe: (difference: number) => `${difference.toFixed(1)} more tiles at stop`,
    },
    {
      advantage: handCandidate.benchmark.averageTurns - storedCandidate.benchmark.averageTurns,
      threshold: 0.1,
      describe: (difference: number) => `${difference.toFixed(1)} fewer turns to ${storedCandidate.benchmark.tiles} tiles`,
    },
    {
      advantage: handCandidate.benchmark.averageTurnsToSkipReady - storedCandidate.benchmark.averageTurnsToSkipReady,
      threshold: 0.1,
      describe: (difference: number) => `${difference.toFixed(1)} fewer turns from checkpoint to skip-ready`,
    },
    {
      advantage: storedCandidate.benchmark.chanceAllCoinRewards - handCandidate.benchmark.chanceAllCoinRewards,
      threshold: 0.05,
      describe: (difference: number) => `${Math.round(difference * 100)}pp better chance at all coin rewards`,
    },
    {
      advantage: storedCandidate.benchmark.averageCoinRewards - handCandidate.benchmark.averageCoinRewards,
      threshold: 0.1,
      describe: (difference: number) => `${difference.toFixed(1)} more coin rewards at checkpoint`,
    },
    {
      advantage: storedCandidate.benchmark.chanceCertificateReward - handCandidate.benchmark.chanceCertificateReward,
      threshold: 0.05,
      describe: (difference: number) => `${Math.round(difference * 100)}pp better certificate chance`,
    },
    {
      advantage: storedCandidate.immediatePriorityBingos - handCandidate.immediatePriorityBingos,
      threshold: 1,
      describe: (difference: number) => `${difference} more immediate priority bingos`,
    },
    {
      advantage: storedCandidate.immediatePriorityProgress - handCandidate.immediatePriorityProgress,
      threshold: 1,
      describe: (difference: number) => `${difference} more immediate priority-line tiles`,
    },
    {
      advantage: storedCandidate.newCells - handCandidate.newCells,
      threshold: 1,
      describe: (difference: number) => `${difference} more tiles covered immediately`,
    },
  ]
  const leadingDifference = comparisons.find(({ advantage, threshold }) => Math.abs(advantage) >= threshold)
  if (!leadingDifference) return `No measurable swap advantage; keep ${handName} in hand.`

  const winner = leadingDifference.advantage > 0 ? storedName : handName
  const difference = leadingDifference.describe(Math.abs(leadingDifference.advantage))
  return winner === storedName
    ? `Swap to ${storedName}: ${difference}.`
    : `Keep ${handName}: ${difference} vs ${storedName}.`
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
          <span className="recommendation-tag">{isPlannerThinking ? 'SEARCHING' : `${plannerBenchmark} TILES`}</span>
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
                aria-label={`Select recommended placement ${positionLabel(recommendation.center)}, about ${recommendation.benchmark.averagePriorityBingos.toFixed(1)} priority bingos at ${recommendation.benchmark.tiles} tiles`}
                onMouseEnter={() => chooseForPreview(recommendation.center)}
                onMouseLeave={clearPreview}
                onFocus={() => chooseForPreview(recommendation.center)}
                onBlur={clearPreview}
                onClick={() => toggleRecommendation(recommendation.center)}
              >
                <strong>{positionLabel(recommendation.center)}</strong>
                <span className="move-score">
                  <strong>~{recommendation.benchmark.averagePriorityBingos.toFixed(1)}</strong>
                  <small>priority bingos</small>
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

        {recommendation && <p className="score-legend">{plannerBenchmark} tiles · {ADAPTIVE_STRATEGIES.find(({ id }) => id === plannerStrategy)?.name.replace('Adaptive: ', '') ?? 'selected strategy'}</p>}

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
                  <span className="alternative-rank">~{candidate.benchmark.averagePriorityBingos.toFixed(1)}</span>
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
                  <div><dt>{activeCandidate.benchmark.tiles} tiles</dt><dd>~{activeCandidate.benchmark.averagePriorityBingos.toFixed(1)} priority · {activeCandidate.benchmark.averageBingos.toFixed(1)} total</dd></div>
                  <div><dt>Now</dt><dd>+{activeCandidate.newCells} {activeCandidate.newCells === 1 ? 'tile' : 'tiles'} · {immediateBingoText}</dd></div>
                  <div><dt>To stop</dt><dd>~{activeCandidate.projectedTurnsToStop.toFixed(1)} turns</dd></div>
                  <div><dt>At {activeCandidate.benchmark.tiles} tiles</dt><dd>{Math.round(activeCandidate.benchmark.chanceAllCoinRewards * 100)}% all coins · {Math.round(activeCandidate.benchmark.chanceCertificateReward * 100)}% certificate</dd></div>
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