import { useEffect, useRef, useState } from 'react'
import {
  BINGO_LINES,
  BOARD_SIZE,
  PIECES,
  canPlacePiece,
  countLineCells,
  createEmptyBoard,
  getCompletedLines,
  placePiece,
  rankPlacements,
  type Board,
  type PieceType,
  type Position,
} from './game'
import './App.css'

const STORAGE_KEY = 'bingo-adaptive-board-v1'
const SKIP_ESTIMATE = 42
const LETTERS = 'ABCDEFG'.split('')
const PIECE_OPTIONS: { type: PieceType; name: string }[] = [
  { type: 'plus', name: 'Plus' },
  { type: 'cross', name: 'Cross' },
  { type: 'square', name: 'Square' },
  { type: 'horizontal', name: 'Horizontal' },
  { type: 'vertical', name: 'Vertical' },
]

type SavedState = { board: Board; pieceType: PieceType }

const isBoard = (value: unknown): value is Board =>
  Array.isArray(value) &&
  value.length === BOARD_SIZE &&
  value.every(
    (row) =>
      Array.isArray(row) &&
      row.length === BOARD_SIZE &&
      row.every((cell) => typeof cell === 'boolean'),
  )

const isPieceType = (value: unknown): value is PieceType =>
  PIECE_OPTIONS.some((option) => option.type === value)

const readSavedState = (): SavedState => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return { board: createEmptyBoard(), pieceType: 'cross' }

    const parsed: unknown = JSON.parse(saved)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'board' in parsed &&
      'pieceType' in parsed &&
      isBoard(parsed.board) &&
      isPieceType(parsed.pieceType)
    ) {
      return { board: parsed.board, pieceType: parsed.pieceType }
    }
  } catch {
    return { board: createEmptyBoard(), pieceType: 'cross' }
  }

  return { board: createEmptyBoard(), pieceType: 'cross' }
}

const positionLabel = ({ row, col }: Position): string =>
  `${LETTERS[col]}${row + 1}`

const PieceIcon = ({ pieceType }: { pieceType: PieceType }) => (
  <span className="piece-icon-grid" aria-hidden="true">
    {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
      const row = Math.floor(index / BOARD_SIZE) - 3
      const col = (index % BOARD_SIZE) - 3
      const filled = PIECES[pieceType].some(
        (offset) => offset.row === row && offset.col === col,
      )

      return (
        <i
          className={filled ? 'piece-icon-cell is-filled' : 'piece-icon-cell'}
          key={index}
        />
      )
    })}
  </span>
)

function App() {
  const [savedState] = useState(readSavedState)
  const [board, setBoard] = useState(savedState.board)
  const [pieceType, setPieceType] = useState(savedState.pieceType)
  const [history, setHistory] = useState<Board[]>([])
  const [hoveredPosition, setHoveredPosition] = useState<Position | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const boardGridRef = useRef<HTMLDivElement>(null)

  const recommendations = rankPlacements(board, pieceType)
  const recommendation = recommendations[0] ?? null
  const activePosition =
    hoveredPosition ?? selectedPosition ?? recommendation?.center ?? null
  const completedLines = getCompletedLines(board)
  const coveredCount = board.reduce(
    (total, row) => total + row.filter(Boolean).length,
    0,
  )
  const progressLines = BINGO_LINES.map((line) => ({
    line,
    count: countLineCells(board, line),
  }))
    .filter(({ count }) => count > 0 && count < BOARD_SIZE)
    .sort(
      (left, right) =>
        right.line.weight * right.count - left.line.weight * left.count,
    )
    .slice(0, 3)

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ board, pieceType }),
      )
    } catch {
      // Continue using the board if browser storage is unavailable.
    }
  }, [board, pieceType])

  useEffect(() => {
    const boardGrid = boardGridRef.current
    if (!boardGrid) return

    let lastWheelTime = 0
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const now = Date.now()
      if (now - lastWheelTime < 140 || event.deltaY === 0) return
      lastWheelTime = now
      const direction = Math.sign(event.deltaY)

      setPieceType((current) => {
        const currentIndex = PIECE_OPTIONS.findIndex(
          (option) => option.type === current,
        )
        const nextIndex =
          (currentIndex + direction + PIECE_OPTIONS.length) % PIECE_OPTIONS.length
        return PIECE_OPTIONS[nextIndex].type
      })
      setHoveredPosition(null)
      setSelectedPosition(null)
    }

    boardGrid.addEventListener('wheel', handleWheel, { passive: false })
    return () => boardGrid.removeEventListener('wheel', handleWheel)
  }, [])

  const commitPlacement = (center: Position | null) => {
    if (!center) return
    setHistory((previous) => [...previous, board].slice(-30))
    setBoard(placePiece(board, pieceType, center))
    setHoveredPosition(null)
    setSelectedPosition(null)
  }

  const undo = () => {
    const previousBoard = history.at(-1)
    if (!previousBoard) return
    setBoard(previousBoard)
    setHistory((previous) => previous.slice(0, -1))
    setHoveredPosition(null)
    setSelectedPosition(null)
  }

  const clearBoard = () => {
    if (coveredCount === 0) return
    setHistory((previous) => [...previous, board].slice(-30))
    setBoard(createEmptyBoard())
    setHoveredPosition(null)
    setSelectedPosition(null)
  }

  const previewCells = new Map<string, boolean>()
  if (activePosition && canPlacePiece(pieceType, activePosition)) {
    for (const offset of PIECES[pieceType]) {
      const row = activePosition.row + offset.row
      const col = activePosition.col + offset.col
      if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
        continue
      }
      previewCells.set(`${row}-${col}`, board[row][col])
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Bingo Buddy home">
          <span className="brand-mark" aria-hidden="true">✿</span>
          <span className="brand-copy">
            <strong>TRICKCAL BINGO</strong>
          </span>
        </a>
        <span className="local-badge">
          <span className="status-dot" /> Saved in this browser
        </span>
      </header>

      <section className="page-heading" id="top">
        <div>
          <p className="eyebrow">ADAPTIVE PLAYGROUND <span>·</span> BOARD 01</p>
        </div>
        <div className="quick-stats" aria-label="Board summary">
          <div className="quick-stat">
            <strong>{coveredCount}<span> / 49</span></strong>
            <span>tiles covered</span>
          </div>
          <div className="quick-stat">
            <strong>{completedLines.length}<span> / 16</span></strong>
            <span>bingos</span>
          </div>
        </div>
      </section>

      <div
        className="skip-progress"
        aria-label={`${coveredCount} of ${SKIP_ESTIMATE} estimated tiles covered toward skip threshold`}
      >
        <div className="skip-progress-track">
          <span style={{ width: `${Math.min(coveredCount / SKIP_ESTIMATE, 1) * 100}%` }} />
          <i style={{ left: `${(SKIP_ESTIMATE / 49) * 100}%` }} />
        </div>
        <div className="skip-progress-labels">
          <span>{coveredCount >= SKIP_ESTIMATE ? 'Skip point reached!' : 'Tiles until estimated skip point'}</span>
          <span>{coveredCount} / {SKIP_ESTIMATE} <small>estimated</small></span>
        </div>
      </div>

      <section className="workspace">
        <div className="board-section">
          <div className="board-toolbar">
            <div>
              <p className="section-kicker">YOUR BOARD</p>
            </div>
            <div className="board-actions">
              <button className="text-button" type="button" onClick={undo} disabled={history.length === 0}>
                Undo
              </button>
              <button className="text-button clear-button" type="button" onClick={clearBoard} disabled={coveredCount === 0}>
                Clear
              </button>
            </div>
          </div>

          <div className="board-shell">
            <span className="axis-corner" aria-hidden="true">·</span>
            <div className="column-labels" aria-hidden="true">
              {LETTERS.map((letter) => <span key={letter}>{letter}</span>)}
            </div>
            <div className="row-labels" aria-hidden="true">
              {Array.from({ length: BOARD_SIZE }, (_, index) => <span key={index}>{index + 1}</span>)}
            </div>
            <div className="board-grid" ref={boardGridRef} role="grid" aria-label="7 by 7 bingo board">
              {board.map((row, rowIndex) =>
                row.map((covered, colIndex) => {
                  const center = { row: rowIndex, col: colIndex }
                  const key = `${rowIndex}-${colIndex}`
                  const preview = previewCells.get(key)
                  const isRecommended = recommendation?.center.row === rowIndex && recommendation.center.col === colIndex
                  const cellClass = [
                    'board-cell',
                    covered ? 'is-covered' : '',
                    preview === false ? 'is-preview-new' : '',
                    preview === true ? 'is-preview-overlap' : '',
                    isRecommended ? 'is-recommendation-anchor' : '',
                  ].filter(Boolean).join(' ')

                  return (
                    <button
                      className={cellClass}
                      type="button"
                      role="gridcell"
                      key={key}
                      aria-label={`${LETTERS[colIndex]}${rowIndex + 1}${covered ? ', covered' : ', empty'}`}
                      title={`${LETTERS[colIndex]}${rowIndex + 1}`}
                      onMouseEnter={() => setHoveredPosition(center)}
                      onMouseLeave={() => setHoveredPosition(null)}
                      onFocus={() => setHoveredPosition(center)}
                      onBlur={() => setHoveredPosition(null)}
                      onClick={() => setSelectedPosition(center)}
                      onDoubleClick={() => commitPlacement(center)}
                    />
                  )
                }),
              )}
            </div>
          </div>

          <div className="board-legend" aria-label="Board legend">
            <span><i className="legend-covered" /> Covered</span>
            <span><i className="legend-new" /> New tile</span>
            <span><i className="legend-overlap" /> Already covered</span>
          </div>
          <p className="board-hint">Click to preview <b>·</b> Double-click to place <b>·</b> Scroll here to switch pieces</p>
        </div>

        <aside className="strategy-panel">
          <section className="piece-section">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">YOUR PIECE</p>
                <h2>Who's up?</h2>
              </div>
            </div>
            <div className="piece-picker" role="group" aria-label="Piece type">
              {PIECE_OPTIONS.map((option) => (
                <button
                  className={`piece-option piece-${option.type} ${pieceType === option.type ? 'selected' : ''}`}
                  type="button"
                  key={option.type}
                  aria-pressed={pieceType === option.type}
                  aria-label={option.name}
                  title={option.name}
                  onClick={() => {
                    setPieceType(option.type)
                    setHoveredPosition(null)
                    setSelectedPosition(null)
                  }}
                >
                  <PieceIcon pieceType={option.type} />
                </button>
              ))}
            </div>
          </section>

          <section className="recommendation-section" aria-live="polite">
            <div className="panel-heading recommendation-heading">
              <div>
                <p className="section-kicker">SMART SUGGESTION</p>
                <h2>Best next spot</h2>
              </div>
              <span className="recommendation-tag">TOP PICK</span>
            </div>

            {recommendation ? (
              <>
                <div className="recommended-move">
                  <strong>{positionLabel(recommendation.center)}</strong>
                  <p>{recommendation.explanation}</p>
                </div>
                <div className="move-facts">
                  <div><strong>{recommendation.newCells}</strong><span>new tiles</span></div>
                  <div><strong>{recommendation.overlaps}</strong><span>overlap</span></div>
                  <div><strong>{recommendation.completedLines.length}</strong><span>bingos</span></div>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => commitPlacement(activePosition)}
                  disabled={!activePosition}
                >
                  Place at {activePosition ? positionLabel(activePosition) : '—'}
                  <span aria-hidden="true">→</span>
                </button>
                {activePosition && (activePosition.row !== recommendation.center.row || activePosition.col !== recommendation.center.col) && (
                  <button className="text-button use-recommendation" type="button" onClick={() => setSelectedPosition(recommendation.center)}>
                    Back to top spot ({positionLabel(recommendation.center)})
                  </button>
                )}
              </>
            ) : (
              <p className="empty-note">No legal placement for this piece.</p>
            )}

            {recommendations.length > 1 && (
              <div className="alternatives">
                <p className="alternatives-title">More good spots</p>
                {recommendations.slice(1, 4).map((candidate, index) => (
                  <button
                    className="alternative-row"
                    type="button"
                    key={`${candidate.center.row}-${candidate.center.col}`}
                    onMouseEnter={() => setHoveredPosition(candidate.center)}
                    onMouseLeave={() => setHoveredPosition(null)}
                    onFocus={() => setHoveredPosition(candidate.center)}
                    onBlur={() => setHoveredPosition(null)}
                    onClick={() => setSelectedPosition(candidate.center)}
                  >
                    <span className="alternative-rank">0{index + 2}</span>
                    <span className="alternative-position">{positionLabel(candidate.center)}</span>
                    <span className="alternative-summary">{candidate.completedLines.length > 0 ? `${candidate.completedLines.length} bingo${candidate.completedLines.length > 1 ? 's' : ''}` : `+${candidate.newCells} tiles`}</span>
                    <span className="alternative-arrow" aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="lines-section">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">LINE STATUS</p>
                <h2>{completedLines.length > 0 ? `${completedLines.length} bingos complete` : 'Bingo progress'}</h2>
              </div>
              <span className="line-count">{completedLines.length}/16</span>
            </div>
            {completedLines.length > 0 && (
              <ul className="completed-list">
                {completedLines.map((line) => <li key={line.id}><span>{line.label}</span><strong>{line.reward}</strong></li>)}
              </ul>
            )}
            {progressLines.length > 0 ? (
              <ul className="progress-list">
                {progressLines.map(({ line, count }) => (
                  <li key={line.id}>
                    <div><span>{line.label}</span><span>{count}/7</span></div>
                    <span className="line-progress-track"><i style={{ width: `${(count / 7) * 100}%` }} /></span>
                  </li>
                ))}
              </ul>
            ) : completedLines.length === 0 ? (
              <p className="empty-note">Place a piece to start building lines.</p>
            ) : null}
          </section>
        </aside>
      </section>

      <footer className="page-footer">
        <span>Adaptive line heuristic <i>·</i> Prototype</span>
        <span>Weights are experimental, not proof of an optimal strategy.</span>
      </footer>
    </main>
  )
}

export default App
