import { useEffect, useRef, useState } from 'react'
import { BOARD_SIZE, createEmptyBoard, type PieceRates, type PriorityWeights, type Position } from '../game'
import {
  runSimulationReplay,
  SIMULATION_STRATEGIES,
  type SimulationComparison,
  type SimulationInput,
  type SimulationMove,
  type SimulationReplay,
  type SimulationStrategyId,
} from './engine'

type SimulationPageProps = {
  pieceRates: PieceRates
  priorityWeights: PriorityWeights
  skipThreshold: number
}

const INITIAL_STRATEGIES: SimulationStrategyId[] = [
  'four-by-three',
  'adaptive-fill',
  'adaptive-priority',
]

const formatAverage = (value: number, digits = 1) => value.toFixed(digits)
const containsCell = (cells: Position[], row: number, col: number) =>
  cells.some((cell) => cell.row === row && cell.col === col)

function ReplayBoard({ move }: { move: SimulationMove | null }) {
  const board = move?.board ?? createEmptyBoard()
  const recentCells = move?.newCells ?? []
  const overlaps = move?.overlaps ?? []
  const rewards = new Map(
    (move?.revealedRewards ?? []).map((reward) => [`${reward.row}-${reward.col}`, reward.type]),
  )

  return (
    <div className="replay-board" role="img" aria-label="Board after selected turn">
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
        const row = Math.floor(index / BOARD_SIZE)
        const col = index % BOARD_SIZE
        const isNew = containsCell(recentCells, row, col)
        const isOverlap = containsCell(overlaps, row, col)
        const reward = rewards.get(`${row}-${col}`)
        const classes = [
          'replay-cell',
          board[row][col] ? 'is-covered' : '',
          isNew ? `is-new piece-${move?.placed}` : '',
          isOverlap ? 'is-overlap' : '',
          reward ? `has-${reward}` : '',
        ].filter(Boolean).join(' ')

        return (
          <span className={classes} key={index}>
            {reward && <i aria-label={reward === 'coin' ? '100K coin found' : '10 certificates found'}>{reward === 'coin' ? '$' : 'C'}</i>}
          </span>
        )
      })}
    </div>
  )
}

export function SimulationPage({
  pieceRates,
  priorityWeights,
  skipThreshold,
}: SimulationPageProps) {
  const [selectedStrategies, setSelectedStrategies] = useState(INITIAL_STRATEGIES)
  const [trialCount, setTrialCount] = useState('100')
  const [seedValue, setSeedValue] = useState('20261007')
  const [comparison, setComparison] = useState<SimulationComparison | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'statistics' | 'replay'>('statistics')
  const [lastRunInput, setLastRunInput] = useState<SimulationInput | null>(null)
  const [replayTrialInput, setReplayTrialInput] = useState('1')
  const [replay, setReplay] = useState<SimulationReplay | null>(null)
  const [replayTurn, setReplayTurn] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  const maxReplayTurn = replay
    ? Math.max(0, ...replay.strategies.map((item) => item.moves.length))
    : 0

  useEffect(() => {
    if (!isPlaying || replayTurn >= maxReplayTurn) return
    const timer = window.setTimeout(() => {
      const nextTurn = Math.min(maxReplayTurn, replayTurn + 1)
      setReplayTurn(nextTurn)
      if (nextTurn >= maxReplayTurn) setIsPlaying(false)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [isPlaying, maxReplayTurn, replayTurn])

  const runComparison = () => {
    if (selectedStrategies.length === 0 || isRunning) return
    const input: SimulationInput = {
      strategies: selectedStrategies,
      trials: Math.max(1, Math.min(1000, Math.floor(Number(trialCount) || 1))),
      seed: Number.isFinite(Number(seedValue)) ? Math.floor(Number(seedValue)) : 1,
      skipThreshold,
      pieceRates,
      priorityWeights,
    }
    setLastRunInput(input)
    setComparison(null)
    setReplay(null)
    setReplayTurn(0)
    setIsPlaying(false)
    setActiveView('statistics')
    setIsRunning(true)
    setError(null)
    const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<{ comparison?: SimulationComparison; error?: string }>) => {
      if (event.data.comparison) setComparison(event.data.comparison)
      else setError(event.data.error ?? 'The simulation failed.')
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
      setIsRunning(false)
    }
    worker.onerror = () => {
      setError('The simulation worker stopped unexpectedly.')
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
      setIsRunning(false)
    }
    worker.postMessage(input)
  }

  const openReplay = () => {
    if (!lastRunInput) return
    const trial = Math.max(1, Math.min(lastRunInput.trials, Math.floor(Number(replayTrialInput) || 1)))
    setReplayTrialInput(String(trial))
    setReplay(runSimulationReplay(lastRunInput, trial))
    setReplayTurn(0)
    setIsPlaying(false)
    setActiveView('replay')
  }

  const changeReplayTurn = (turn: number) => {
    setIsPlaying(false)
    setReplayTurn(turn)
  }

  const toggleStrategy = (strategy: SimulationStrategyId, checked: boolean) => {
    setSelectedStrategies((current) => {
      if (checked) {
        return current.includes(strategy) || current.length >= 4
          ? current
          : [...current, strategy]
      }
      return current.length <= 1
        ? current
        : current.filter((item) => item !== strategy)
    })
  }

  return (
    <section className="simulation-view" aria-labelledby="simulation-title">
      <header className="simulation-heading">
        <div>
          <p className="eyebrow">STRATEGY TESTING</p>
          <h1 id="simulation-title">Simulation lab</h1>
          <p>Compare strategies on the same seeded piece draws and hidden reward locations.</p>
        </div>
        <div className="simulation-stop-rule">
          <span>Run ends when skip advice is ready</span>
          <strong>{skipThreshold} tiles + 4 priority bingos + 4 notable rewards</strong>
          <span>Full board is the fallback stop.</span>
        </div>
      </header>

      <div className="simulation-settings">
        <div className="simulation-setting-grid">
          <label className="simulation-field">
            <span>Trials</span>
            <input
              type="number"
              min="1"
              max="1000"
              step="1"
              value={trialCount}
              onChange={(event) => setTrialCount(event.currentTarget.value)}
              onBlur={() => setTrialCount(String(Math.max(1, Math.min(1000, Math.floor(Number(trialCount) || 1)))))}
            />
          </label>
          <label className="simulation-field">
            <span>Random seed</span>
            <input
              type="number"
              step="1"
              value={seedValue}
              onChange={(event) => setSeedValue(event.currentTarget.value)}
            />
          </label>
          <div className="simulation-rates" aria-label="Piece distribution used">
            <span>Piece rates</span>
            <strong>Plus {pieceRates.plus}% · Cross {pieceRates.cross}% · Horizontal {pieceRates.horizontal}% · Vertical {pieceRates.vertical}% · Square {pieceRates.square}%</strong>
            <small>Change rates in planner settings.</small>
          </div>
        </div>

        <fieldset className="strategy-picker">
          <legend>Strategies <span>Select 1–4</span></legend>
          <div className="strategy-options">
            {SIMULATION_STRATEGIES.map((strategy) => {
              const checked = selectedStrategies.includes(strategy.id)
              return (
                <label className={`strategy-option ${checked ? 'is-selected' : ''}`} key={strategy.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && selectedStrategies.length === 4}
                    onChange={(event) => toggleStrategy(strategy.id, event.currentTarget.checked)}
                  />
                  <span className="strategy-option-copy">
                    <strong>{strategy.name}</strong>
                    <small>{strategy.description}</small>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="simulation-run-row">
          <p>Each strategy gets the same piece draws and the same shuffled reward tiles in each trial.</p>
          <button
            className="primary-button simulation-run-button"
            type="button"
            disabled={isRunning || selectedStrategies.length === 0}
            onClick={runComparison}
          >
            {isRunning ? 'Running simulations…' : `Run ${Math.max(1, Math.min(1000, Math.floor(Number(trialCount) || 1)))} trials`}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {error && <p className="simulation-error" role="alert">{error}</p>}

      <div className="simulation-tabs" role="tablist" aria-label="Simulation results view">
        <button type="button" role="tab" aria-selected={activeView === 'statistics'} className={activeView === 'statistics' ? 'is-active' : ''} onClick={() => setActiveView('statistics')}>Statistics</button>
        <button type="button" role="tab" aria-selected={activeView === 'replay'} className={activeView === 'replay' ? 'is-active' : ''} disabled={!lastRunInput} onClick={() => setActiveView('replay')}>Replay</button>
      </div>

      {activeView === 'statistics' && (comparison ? (
        <section className="simulation-results" role="tabpanel" aria-live="polite">
          <div className="simulation-results-heading">
            <div>
              <p className="section-kicker">RESULTS</p>
              <h2>{comparison.trials} shared trials</h2>
            </div>
            <span>Seed {comparison.seed} · stop threshold {comparison.skipThreshold}</span>
          </div>
          <div className="simulation-result-grid">
            {comparison.results.map((result) => {
              const strategy = SIMULATION_STRATEGIES.find((item) => item.id === result.strategy)!
              return (
                <article className="simulation-result" key={result.strategy}>
                  <h3>{strategy.name}</h3>
                  <dl className="simulation-metrics">
                    <div><dt>Turns to cover threshold</dt><dd>{formatAverage(result.averageTurnsToThreshold)}</dd></div>
                    <div><dt>Extra turns to skip readiness</dt><dd>{formatAverage(result.averageTurnsAfterThreshold)}</dd></div>
                    <div><dt>Bingos at threshold</dt><dd>{formatAverage(result.averageBingosAtThreshold)}</dd></div>
                    <div><dt>Priority bingos at threshold</dt><dd>{formatAverage(result.averagePriorityBingosAtThreshold)} / 4</dd></div>
                    <div><dt>100K-coin rewards found at threshold</dt><dd>{formatAverage(result.averageCoinRewardsAtThreshold)} / 3</dd></div>
                    <div><dt>All three coins found at threshold</dt><dd>{Math.round(result.chanceAllCoinRewardsAtThreshold * 100)}%</dd></div>
                    <div><dt>10-certificate tile found at threshold</dt><dd>{Math.round(result.chanceCertificateRewardAtThreshold * 100)}%</dd></div>
                    <div><dt>Bingos at skip readiness</dt><dd>{formatAverage(result.averageBingosAtSkip)}</dd></div>
                  </dl>
                  <div className="simulation-reward-row" aria-label="Bingo reward totals at skip readiness">
                    <span><strong>{formatAverage(result.averageRewardAtSkip.leaves)}</strong> LVs</span>
                    <span><strong>{formatAverage(result.averageRewardAtSkip.starCandy)}</strong> SC</span>
                    <span><strong>{formatAverage(result.averageRewardAtSkip.certificates)}</strong> CRTs</span>
                  </div>
                  <p className="simulation-caption">Average bingo rewards at skip readiness; resource types stay separate.</p>
                </article>
              )
            })}
          </div>
        </section>
      ) : (
        <div className="simulation-empty" role="tabpanel">
          <strong>No results yet</strong>
          <span>Choose the strategies to compare, then run shared trials.</span>
        </div>
      ))}

      {activeView === 'replay' && (
        <section className="simulation-replay" role="tabpanel" aria-label="Strategy replay">
          <div className="replay-toolbar">
            <label className="simulation-field replay-trial-field">
              <span>Trial to replay</span>
              <input
                type="number"
                min="1"
                max={lastRunInput?.trials ?? 1}
                step="1"
                value={replayTrialInput}
                onChange={(event) => setReplayTrialInput(event.currentTarget.value)}
              />
            </label>
            <button className="primary-button replay-load-button" type="button" disabled={!lastRunInput} onClick={openReplay}>Load shared trial</button>
            {replay && <span className="replay-seed">Seed {replay.seed} · Trial {replay.trial}</span>}
          </div>

          {!replay ? (
            <div className="simulation-empty">
              <strong>{lastRunInput ? 'Choose a trial to replay' : 'Run a simulation first'}</strong>
              <span>{lastRunInput ? 'Every strategy will replay the same draws and reward layout for that trial.' : 'The replay uses the exact seed, rates, threshold, and strategies from the latest run.'}</span>
            </div>
          ) : (
            <>
              <div className="replay-controls">
                <div className="replay-step-buttons">
                  <button type="button" aria-label="Previous turn" title="Previous turn" disabled={replayTurn === 0} onClick={() => changeReplayTurn(Math.max(0, replayTurn - 1))}>←</button>
                  <button type="button" aria-label={isPlaying ? 'Pause replay' : 'Play replay'} title={isPlaying ? 'Pause replay' : 'Play replay'} onClick={() => {
                    if (replayTurn >= maxReplayTurn) setReplayTurn(0)
                    setIsPlaying((playing) => !playing)
                  }}>{isPlaying ? 'Ⅱ' : '▶'}</button>
                  <button type="button" aria-label="Next turn" title="Next turn" disabled={replayTurn >= maxReplayTurn} onClick={() => changeReplayTurn(Math.min(maxReplayTurn, replayTurn + 1))}>→</button>
                </div>
                <label className="replay-timeline">
                  <span>Turn {replayTurn} <small>/ {maxReplayTurn}</small></span>
                  <input type="range" min="0" max={maxReplayTurn} step="1" value={replayTurn} onChange={(event) => changeReplayTurn(Number(event.currentTarget.value))} />
                </label>
              </div>

              <div className="replay-strategy-grid">
                {replay.strategies.map((strategyReplay) => {
                  const strategy = SIMULATION_STRATEGIES.find((item) => item.id === strategyReplay.strategy)!
                  const visibleTurns = Math.min(replayTurn, strategyReplay.moves.length)
                  const currentMove = visibleTurns > 0 ? strategyReplay.moves[visibleTurns - 1] : null
                  const finished = replayTurn >= strategyReplay.moves.length
                  return (
                    <article className="replay-strategy" key={strategyReplay.strategy}>
                      <header>
                        <h3>{strategy.name}</h3>
                        <span>{finished && strategyReplay.moves.length > 0 ? `Finished on turn ${strategyReplay.moves.length}` : 'In progress'}</span>
                      </header>
                      <ReplayBoard move={currentMove} />
                      <div className="replay-board-stats">
                        <span><strong>{currentMove?.coveredTiles ?? 0}</strong> tiles</span>
                        <span><strong>{currentMove?.bingos ?? 0}</strong> bingos</span>
                        <span><strong>{visibleTurns}</strong> turns</span>
                      </div>
                      {currentMove ? (
                        <div className="replay-move-detail" aria-live="polite">
                          <strong>Turn {currentMove.turn}: {currentMove.placed} at {String.fromCharCode(65 + currentMove.center.col)}{currentMove.center.row + 1}</strong>
                          <span>Hand: {currentMove.hand}{currentMove.stored ? ` · Stored: ${currentMove.stored}` : ''} · {currentMove.newCells.length} new tiles · {currentMove.overlaps.length} overlaps</span>
                          {currentMove.newBingos.length > 0 && <span className="replay-bingo">Bingo: {currentMove.newBingos.join(', ')}</span>}
                          {currentMove.rewardPickups.length > 0 && <span className="replay-pickup">Found: {currentMove.rewardPickups.map((reward) => reward.type === 'coin' ? '100K coin' : '10 certificates').join(', ')}</span>}
                          {currentMove.newBingos.length === 0 && currentMove.rewardPickups.length === 0 && <span>No bingo or notable tile this turn.</span>}
                        </div>
                      ) : (
                        <div className="replay-move-detail"><strong>Before the first move</strong><span>Advance the shared timeline to compare opening placements.</span></div>
                      )}
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </section>
      )}
    </section>
  )
}
