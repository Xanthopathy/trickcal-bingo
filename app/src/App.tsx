import { useState } from 'react'
import { AnalysisPanel } from './bingo/AnalysisPanel'
import { BoardPanel } from './bingo/BoardPanel'
import { PieceControls } from './bingo/PieceControls'
import { SettingsPopover } from './bingo/SettingsPopover'
import { useBingoSession } from './bingo/useBingoSession'
import { SimulationPage } from './simulation/SimulationPage'
import { TrackingPage } from './tracking/TrackingPage'
import './App.css'

function App() {
  const session = useBingoSession()
  const [activePage, setActivePage] = useState<'planner' | 'simulation' | 'tracking'>('planner')

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Bingo board home">
          <span className="brand-mark" aria-hidden="true">✿</span>
          <span className="brand-copy"><strong>TRICKCAL BINGO</strong></span>
        </a>
        <nav className="page-navigation" aria-label="Main navigation">
          <button
            className={activePage === 'planner' ? 'is-active' : ''}
            type="button"
            aria-current={activePage === 'planner' ? 'page' : undefined}
            onClick={() => setActivePage('planner')}
          >
            Planner
          </button>
          <button
            className={activePage === 'simulation' ? 'is-active' : ''}
            type="button"
            aria-current={activePage === 'simulation' ? 'page' : undefined}
            onClick={() => setActivePage('simulation')}
          >
            Simulation
          </button>
          <button
            className={activePage === 'tracking' ? 'is-active' : ''}
            type="button"
            aria-current={activePage === 'tracking' ? 'page' : undefined}
            onClick={() => setActivePage('tracking')}
          >
            Tracking
          </button>
        </nav>
        <div className="header-actions">
          <span className="local-badge"><span className="status-dot" /> Saved in this browser</span>
          <SettingsPopover session={session} />
        </div>
      </header>

      {activePage === 'planner' ? (
        <section className="workspace">
          <PieceControls session={session} />
          <BoardPanel session={session} />
          <AnalysisPanel session={session} />
        </section>
      ) : (
        activePage === 'simulation' ? (
          <SimulationPage
            pieceRates={session.pieceRates}
            priorityWeights={session.priorityWeights}
            skipThreshold={session.skipThreshold}
          />
        ) : (
          <TrackingPage
            trackedPieceCounts={session.displayedPieceCounts}
            trackingMode={session.trackingMode}
            updateTrackedPieceCount={session.updateTrackedPieceCount}
          />
        )
      )}

      <footer className="page-footer">
        <span>{activePage === 'planner' ? 'Full-board rollout planner · Prototype' : activePage === 'simulation' ? 'Shared-sequence strategy comparison · Prototype' : 'Piece frequency tracker · Local data'}</span>
        <span>{activePage === 'planner' ? 'Candidate moves are compared through simulated board outcomes.' : activePage === 'simulation' ? 'Simulated results are estimates and depend on the configured piece rates.' : 'Rates are calculated from the recorded piece amounts.'}</span>
      </footer>
    </main>
  )
}

export default App