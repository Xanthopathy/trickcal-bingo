import { useEffect, useRef, useState } from 'react'
import type { PieceRates, PriorityWeights } from '../game'
import {
  SIMULATION_STRATEGIES,
  type SimulationComparison,
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
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  const runComparison = () => {
    if (selectedStrategies.length === 0 || isRunning) return
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
    worker.postMessage({
      strategies: selectedStrategies,
      trials: Math.max(1, Math.min(1000, Math.floor(Number(trialCount) || 1))),
      seed: Number.isFinite(Number(seedValue)) ? Math.floor(Number(seedValue)) : 1,
      skipThreshold,
      pieceRates,
      priorityWeights,
    })
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
            <strong>Plus {pieceRates.plus}% · Cross {pieceRates.cross}% · H {pieceRates.horizontal}% · V {pieceRates.vertical}% · Square {pieceRates.square}%</strong>
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

      {comparison ? (
        <section className="simulation-results" aria-live="polite">
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
        <div className="simulation-empty">
          <strong>No results yet</strong>
          <span>Choose the strategies to compare, then run shared trials.</span>
        </div>
      )}
    </section>
  )
}
