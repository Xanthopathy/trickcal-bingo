import type { PriorityWeights } from '../game'
import type { BingoSession } from './useBingoSession'
import { PIECE_OPTIONS } from './constants'

type SettingsPopoverProps = Pick<
  BingoSession,
  | 'pieceRates'
  | 'priorityWeights'
  | 'resetSiteData'
  | 'setSettingsOpen'
  | 'setSkipThreshold'
  | 'settingsOpen'
  | 'skipThreshold'
  | 'totalPieceRate'
  | 'updatePieceRate'
  | 'updatePriorityWeight'
>

const PRIORITY_OPTIONS: { key: keyof PriorityWeights; label: string }[] = [
  { key: 'diagonal', label: 'Diagonals' },
  { key: 'priority', label: 'Row 4 / Column D' },
  { key: 'outer', label: 'Outer rows / columns' },
  { key: 'other', label: 'Other lines' },
]

export function SettingsPopover({ session }: { session: SettingsPopoverProps }) {
  const {
    pieceRates,
    priorityWeights,
    resetSiteData,
    setSettingsOpen,
    setSkipThreshold,
    settingsOpen,
    skipThreshold,
    totalPieceRate,
    updatePieceRate,
    updatePriorityWeight,
  } = session

  return (
    <div className="settings-anchor">
      <button
        className="settings-button"
        type="button"
        aria-label="Settings"
        aria-expanded={settingsOpen}
        title="Settings"
        onClick={() => setSettingsOpen((open) => !open)}
      >
        ⚙
      </button>
      {settingsOpen && (
        <section className="settings-popover" role="dialog" aria-label="Prototype settings">
          <div className="settings-heading">
            <div>
              <p className="section-kicker">TEST PARAMETERS</p>
              <h2>Settings</h2>
            </div>
            <button
              className="settings-close"
              type="button"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
            >
              ×
            </button>
          </div>

          <label className="setting-row">
            <span>Tiles to skip</span>
            <input
              type="number"
              min="1"
              max="49"
              step="1"
              value={skipThreshold}
              onChange={(event) =>
                setSkipThreshold(
                  Math.max(1, Math.min(49, Math.round(Number(event.currentTarget.value) || 1))),
                )
              }
            />
          </label>

          <div className="settings-group">
            <div className="settings-group-heading">
              <h3>Piece drop rates</h3>
              <span>{totalPieceRate}% total</span>
            </div>
            <p>Rates are normalized automatically when scoring.</p>
            {PIECE_OPTIONS.map((option) => (
              <label className="setting-row" key={option.type}>
                <span>{option.name}</span>
                <span className="setting-input-suffix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={pieceRates[option.type]}
                    onChange={(event) =>
                      updatePieceRate(option.type, Number(event.currentTarget.value))
                    }
                  />
                  <span>%</span>
                </span>
              </label>
            ))}
          </div>

          <div className="settings-group">
            <div className="settings-group-heading">
              <h3>Heuristic priorities</h3>
              <span>Experimental</span>
            </div>
            {PRIORITY_OPTIONS.map(({ key, label }) => (
              <label className="setting-row" key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  min="0"
                  max="12"
                  step="0.1"
                  value={priorityWeights[key]}
                  onChange={(event) =>
                    updatePriorityWeight(key, Number(event.currentTarget.value))
                  }
                />
              </label>
            ))}
          </div>

          <button className="reset-data-button" type="button" onClick={resetSiteData}>
            Reset all site data
          </button>
        </section>
      )}
    </div>
  )
}