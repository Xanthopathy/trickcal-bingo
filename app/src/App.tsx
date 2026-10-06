import { AnalysisPanel } from './bingo/AnalysisPanel'
import { BoardPanel } from './bingo/BoardPanel'
import { PieceControls } from './bingo/PieceControls'
import { SettingsPopover } from './bingo/SettingsPopover'
import { useBingoSession } from './bingo/useBingoSession'
import './App.css'

function App() {
  const session = useBingoSession()

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Bingo board home">
          <span className="brand-mark" aria-hidden="true">✿</span>
          <span className="brand-copy"><strong>TRICKCAL BINGO</strong></span>
        </a>
        <div className="header-actions">
          <span className="local-badge"><span className="status-dot" /> Saved in this browser</span>
          <SettingsPopover session={session} />
        </div>
      </header>

      <section className="workspace">
        <PieceControls session={session} />
        <BoardPanel session={session} />
        <AnalysisPanel session={session} />
      </section>

      <footer className="page-footer">
        <span>Adaptive line heuristic · Prototype</span>
        <span>Weights are experimental, not proof of an optimal strategy.</span>
      </footer>
    </main>
  )
}

export default App