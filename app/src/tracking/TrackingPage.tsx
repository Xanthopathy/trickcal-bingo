import type { PieceType } from '../game'
import { PIECE_OPTIONS } from '../bingo/constants'

const PIECE_DESCRIPTIONS: Record<PieceType, string> = {
  plus: '3×3 w/o corners',
  cross: '3×3 w/o edge centers',
  square: 'Full 3×3',
  horizontal: 'Wide 7×1',
  vertical: 'Tall 1×7',
}

type TrackingPageProps = {
  trackedPieceCounts: Record<PieceType, number>
  trackingMode: boolean
  updateTrackedPieceCount: (piece: PieceType, value: number) => void
}

export function TrackingPage({ trackedPieceCounts, trackingMode, updateTrackedPieceCount }: TrackingPageProps) {
  const totalPieces = Object.values(trackedPieceCounts).reduce((total, count) => total + count, 0)

  return (
    <section className="tracking-view" aria-labelledby="tracking-title">
      <header className="tracking-heading">
        <div>
          <p className="section-kicker">PIECE DISTRIBUTION</p>
          <h1 id="tracking-title">Piece tracking</h1>
          <p>Observed piece amounts and their share of all recorded pieces.</p>
        </div>
        <div className={`tracking-status ${trackingMode ? 'is-active' : ''}`}>
          <span className="tracking-status-dot" />
          {trackingMode ? 'Planner tracking is on' : 'Planner is in sandbox mode'}
        </div>
      </header>

      <div className="tracking-summary">
        <strong>{totalPieces.toLocaleString()}</strong>
        <span>pieces recorded</span>
      </div>

      <div className="tracking-table-wrap">
        <table className="tracking-table">
          <thead>
            <tr>
              <th scope="col">Piece</th>
              <th scope="col">Description</th>
              <th scope="col" className="tracking-number">Amount</th>
              <th scope="col" className="tracking-number">Rate</th>
            </tr>
          </thead>
          <tbody>
            {PIECE_OPTIONS.map(({ type, name }) => (
              <tr key={type}>
                <th scope="row"><span className={`tracking-piece-marker piece-${type}`} />{name}</th>
                <td>{PIECE_DESCRIPTIONS[type]}</td>
                <td className="tracking-number">
                  <input
                    className="tracking-amount-input"
                    type="number"
                    min="0"
                    step="1"
                    aria-label={`${name} amount`}
                    value={trackedPieceCounts[type]}
                    onChange={(event) => updateTrackedPieceCount(type, event.currentTarget.valueAsNumber)}
                  />
                </td>
                <td className="tracking-number">
                  {totalPieces === 0 ? '0.00' : (trackedPieceCounts[type] / totalPieces * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>Total</th>
              <td className="tracking-number">{totalPieces.toLocaleString()}</td>
              <td className="tracking-number">100.00%</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="tracking-note">Amounts start with your spreadsheet figures and can be edited here. Planner placements are added only while tracking is on; undo retracts the corresponding placement.</p>
    </section>
  )
}