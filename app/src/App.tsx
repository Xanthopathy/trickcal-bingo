import { useState } from 'react'
import { AnalysisPanel } from './bingo/AnalysisPanel'
import { BoardPanel } from './bingo/BoardPanel'
import { PieceControls } from './bingo/PieceControls'
import { SettingsPopover } from './bingo/SettingsPopover'
import { useBingoSession } from './bingo/useBingoSession'
import { SimulationPage } from './simulation/SimulationPage'
import './App.css'

function App() {
  const session = useBingoSession()
  const [activePage, setActivePage] = useState<'planner' | 'simulation'>('planner')

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
        <SimulationPage
          pieceRates={session.pieceRates}
          priorityWeights={session.priorityWeights}
          skipThreshold={session.skipThreshold}
        />
      )}

      <footer className="page-footer">
        <span>{activePage === 'planner' ? 'Adaptive line heuristic · Prototype' : 'Shared-sequence strategy comparison · Prototype'}</span>
        <span>{activePage === 'planner' ? 'Weights are experimental, not proof of an optimal strategy.' : 'Simulated results are estimates and depend on the configured piece rates.'}</span>
      </footer>
    </main>
  )
}

export default App