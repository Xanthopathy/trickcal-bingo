import { useEffect, useRef, useState } from 'react'
import {
  BINGO_LINES,
  BOARD_SIZE,
  PIECES,
  canPlacePiece,
  countLineCells,
  createEmptyBoard,
  getPlacementCenter,
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
  { type: 'square', name: '3×3 square' },
  { type: 'horizontal', name: 'Horizontal' },
  { type: 'vertical', name: 'Vertical' },
]

type SavedState = {
  board: Board
  pieceType: PieceType | null
  slotPieceType: PieceType | null
}

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
    if (!saved) {
      return { board: createEmptyBoard(), pieceType: 'cross', slotPieceType: null }
    }
    const parsed: unknown = JSON.parse(saved)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'board' in parsed &&
      'pieceType' in parsed &&
      isBoard(parsed.board) &&
      (isPieceType(parsed.pieceType) || parsed.pieceType === null)
    ) {
      return {
        board: parsed.board,
        pieceType: parsed.pieceType,
        slotPieceType:
          'slotPieceType' in parsed && isPieceType(parsed.slotPieceType)
            ? parsed.slotPieceType
            : null,
      }
    }
  } catch {
    return { board: createEmptyBoard(), pieceType: 'cross', slotPieceType: null }
  }

  return { board: createEmptyBoard(), pieceType: 'cross', slotPieceType: null }
}

const positionLabel = ({ row, col }: Position): string =>
  `${LETTERS[col]}${row + 1}`

const PieceIcon = ({ pieceType }: { pieceType: PieceType }) => (
  <span className={`piece-icon-grid piece-icon-${pieceType}`} aria-hidden="true">
    {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
      const row = Math.floor(index / BOARD_SIZE) - 3
      const col = (index % BOARD_SIZE) - 3
      const filled = PIECES[pieceType].some(
        (offset) => offset.row === row && offset.col === col,
      )

      return <i className={filled ? 'piece-icon-cell is-filled' : 'piece-icon-cell'} key={index} />
    })}
  </span>
)

function App() {
  const [savedState] = useState(readSavedState)
  const [board, setBoard] = useState(savedState.board)
  const [pieceType, setPieceType] = useState<PieceType | null>(savedState.pieceType)
  const [slotPieceType, setSlotPieceType] = useState<PieceType | null>(savedState.slotPieceType)
  const [history, setHistory] = useState<Board[]>([])
  const [hoveredPosition, setHoveredPosition] = useState<Position | null>(null)
  const [cursorPosition, setCursorPosition] = useState<Position | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(() =>
    savedState.pieceType
      ? rankPlacements(savedState.board, savedState.pieceType)[0]?.center ?? null
      : null,
  )
  const [dismissedHoverPosition, setDismissedHoverPosition] = useState<Position | null>(null)
  const boardGridRef = useRef<HTMLDivElement>(null)

  const recommendations = pieceType ? rankPlacements(board, pieceType) : []
  const recommendation = recommendations[0] ?? null
  const activePosition =
    cursorPosition ?? hoveredPosition ?? selectedPosition ?? null
  const isAutomaticSuggestion = cursorPosition === null
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
        JSON.stringify({ board, pieceType, slotPieceType }),
      )
    } catch {
      // Continue using the board if browser storage is unavailable.
    }
  }, [board, pieceType, slotPieceType])

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
        const nextIndex = currentIndex < 0
          ? direction > 0 ? 0 : PIECE_OPTIONS.length - 1
          : (currentIndex + direction + PIECE_OPTIONS.length) % PIECE_OPTIONS.length
        return PIECE_OPTIONS[nextIndex].type
      })
      setCursorPosition(null)
      setHoveredPosition(null)
      setSelectedPosition(null)
    }

    boardGrid.addEventListener('wheel', handleWheel, { passive: false })
    return () => boardGrid.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return

      const key = event.key.toLowerCase()
      if (/^[1-5]$/.test(key)) {
        const nextPieceType = PIECE_OPTIONS[Number(key) - 1].type
        setPieceType(nextPieceType)
        setSelectedPosition(rankPlacements(board, nextPieceType)[0]?.center ?? null)
        setCursorPosition(null)
        setHoveredPosition(null)
        setDismissedHoverPosition(null)
        event.preventDefault()
        return
      }

      if (key === 's') {
        let nextPieceType = pieceType
        let nextSlotPieceType = slotPieceType
        if (slotPieceType) {
          nextPieceType = slotPieceType
          nextSlotPieceType = pieceType
        } else if (pieceType) {
          nextSlotPieceType = pieceType
          nextPieceType = null
        }
        setPieceType(nextPieceType)
        setSlotPieceType(nextSlotPieceType)
        setSelectedPosition(
          nextPieceType ? rankPlacements(board, nextPieceType)[0]?.center ?? null : null,
        )
        setCursorPosition(null)
        setHoveredPosition(null)
        setDismissedHoverPosition(null)
        event.preventDefault()
        return
      }

      if (key === 'z') {
        const previousBoard = history.at(-1)
        if (previousBoard) {
          setBoard(previousBoard)
          setHistory((previous) => previous.slice(0, -1))
          setSelectedPosition(
            pieceType ? rankPlacements(previousBoard, pieceType)[0]?.center ?? null : null,
          )
          setCursorPosition(null)
          setHoveredPosition(null)
          setDismissedHoverPosition(null)
        }
        event.preventDefault()
        return
      }

      if (key === 'r') {
        const emptyBoard = createEmptyBoard()
        setBoard(emptyBoard)
        setPieceType('cross')
        setSlotPieceType(null)
        setHistory([])
        setSelectedPosition(rankPlacements(emptyBoard, 'cross')[0]?.center ?? null)
        setCursorPosition(null)
        setHoveredPosition(null)
        setDismissedHoverPosition(null)
        event.preventDefault()
        return
      }

      if (key === 'p') {
        const center = cursorPosition ?? hoveredPosition ?? selectedPosition
        if (center && pieceType) {
          setHistory((previous) => [...previous, board].slice(-30))
          const nextBoard = placePiece(board, pieceType, center)
          setBoard(nextBoard)
          setSelectedPosition(rankPlacements(nextBoard, pieceType)[0]?.center ?? null)
          setCursorPosition(null)
          setHoveredPosition(null)
          setDismissedHoverPosition(null)
        }
        event.preventDefault()
        return
      }

      const candidateIndexByKey: Record<string, number> = {
        '7': 0,
        '8': 1,
        '9': 2,
        '0': 3,
      }
      const candidateIndex = candidateIndexByKey[key]
      if (candidateIndex !== undefined && pieceType) {
        const candidate = rankPlacements(board, pieceType)[candidateIndex]
        if (candidate) {
          const isSelected =
            selectedPosition?.row === candidate.center.row &&
            selectedPosition.col === candidate.center.col
          setSelectedPosition(isSelected ? null : candidate.center)
          setCursorPosition(null)
          setHoveredPosition(null)
          setDismissedHoverPosition(isSelected ? candidate.center : null)
          event.preventDefault()
        }
        return
      }

      if (key === 'escape') {
        setSelectedPosition(null)
        setCursorPosition(null)
        setHoveredPosition(null)
        setDismissedHoverPosition(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [board, cursorPosition, history, hoveredPosition, pieceType, selectedPosition, slotPieceType])

  const commitPlacement = (center: Position | null) => {
    if (!center || !pieceType) return
    setHistory((previous) => [...previous, board].slice(-30))
    const nextBoard = placePiece(board, pieceType, center)
    setBoard(nextBoard)
    setSelectedPosition(rankPlacements(nextBoard, pieceType)[0]?.center ?? null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
  }

  const undo = () => {
    const previousBoard = history.at(-1)
    if (!previousBoard) return
    setBoard(previousBoard)
    setHistory((previous) => previous.slice(0, -1))
    setSelectedPosition(
      pieceType ? rankPlacements(previousBoard, pieceType)[0]?.center ?? null : null,
    )
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
  }

  const startNewBoard = () => {
    const emptyBoard = createEmptyBoard()
    setBoard(emptyBoard)
    setPieceType('cross')
    setSlotPieceType(null)
    setHistory([])
    setSelectedPosition(rankPlacements(emptyBoard, 'cross')[0]?.center ?? null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
  }

  const swapSlot = () => {
    let nextPieceType = pieceType
    let nextSlotPieceType = slotPieceType

    if (slotPieceType) {
      nextPieceType = slotPieceType
      nextSlotPieceType = pieceType
    } else if (pieceType) {
      nextSlotPieceType = pieceType
      nextPieceType = null
    }

    setPieceType(nextPieceType)
    setSlotPieceType(nextSlotPieceType)
    setSelectedPosition(
      nextPieceType ? rankPlacements(board, nextPieceType)[0]?.center ?? null : null,
    )
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
  }

  const toggleRecommendation = (center: Position) => {
    const isSelected =
      selectedPosition?.row === center.row && selectedPosition.col === center.col

    setSelectedPosition(isSelected ? null : center)
    setHoveredPosition(null)
    setDismissedHoverPosition(isSelected ? center : null)
  }

  const previewCells = new Map<string, boolean>()
  if (pieceType && activePosition && canPlacePiece(pieceType, activePosition)) {
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
        <a className="brand" href="#top" aria-label="Bingo board home">
          <span className="brand-mark" aria-hidden="true">✿</span>
          <span className="brand-copy"><strong>TRICKCAL BINGO</strong></span>
        </a>
        <span className="local-badge"><span className="status-dot" /> Saved in this browser</span>
      </header>

      <section className="workspace">
        <aside className="analysis-column piece-controls" aria-label="Piece controls">
          <section className="analysis-heading" id="top">
            <div>
              <p className="eyebrow">BOARD ANALYSIS</p>
              <h1>Current run</h1>
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

          <div className="skip-progress" aria-label={`${coveredCount} of ${SKIP_ESTIMATE} tiles covered toward skip threshold`}>
            <div className="skip-progress-track">
              <span style={{ width: `${Math.min(coveredCount / SKIP_ESTIMATE, 1) * 100}%` }} />
              <i style={{ left: `${(SKIP_ESTIMATE / 49) * 100}%` }} />
            </div>
            <div className="skip-progress-labels">
              <span>Skip threshold</span>
              <span>{coveredCount} / {SKIP_ESTIMATE}</span>
            </div>
          </div>

          <section className="piece-section">
            <div className="panel-heading">
              <h2>Piece in hand</h2>
              {pieceType && <span className="piece-name">{PIECE_OPTIONS.find((option) => option.type === pieceType)?.name}</span>}
            </div>
            <div className="piece-picker" role="group" aria-label="Piece in hand">
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
                    setSelectedPosition(rankPlacements(board, option.type)[0]?.center ?? null)
                    setCursorPosition(null)
                    setHoveredPosition(null)
                    setDismissedHoverPosition(null)
                  }}
                >
                  <PieceIcon pieceType={option.type} />
                </button>
              ))}
            </div>
          </section>

          <section className="slot-section">
            <div className="panel-heading">
              <h2>Storage slot</h2>
              <span className="slot-state">{slotPieceType ? 'Occupied' : 'Empty'}</span>
            </div>
            <div className="slot-controls">
              <div className={`slot-display ${slotPieceType ? 'has-piece' : ''}`}>
                {slotPieceType ? (
                  <PieceIcon pieceType={slotPieceType} />
                ) : (
                  <span className="slot-empty-mark" aria-hidden="true">+</span>
                )}
              </div>
              <div className="slot-copy">
                <strong>{slotPieceType ? PIECE_OPTIONS.find((option) => option.type === slotPieceType)?.name : 'No stored piece'}</strong>
                <span>{slotPieceType ? 'Ready to swap into hand' : 'Store the current piece here'}</span>
              </div>
              <button
                className="swap-button"
                type="button"
                disabled={!pieceType && !slotPieceType}
                onClick={swapSlot}
              >
                {!slotPieceType ? 'Store' : pieceType ? 'Swap' : 'Retrieve'}
              </button>
            </div>
          </section>

          <div className="control-note">
            Hotkeys: 1–5 piece · S swap · Z undo · R restart · P place · 7–0 candidates · Esc clear preview
          </div>

        </aside>

        <section className="board-section" aria-label="Bingo board controls">
          <div className="board-toolbar">
            <div>
              <p className="section-kicker">BOARD STATE</p>
              <h2>7 × 7 grid</h2>
            </div>
            <div className="board-actions">
              <button className="text-button" type="button" onClick={undo} disabled={history.length === 0}>
                Undo
              </button>
              <button
                className="text-button skip-button"
                type="button"
                onClick={startNewBoard}
                disabled={coveredCount < SKIP_ESTIMATE}
                title={coveredCount < SKIP_ESTIMATE ? `Available at ${SKIP_ESTIMATE} covered tiles` : 'Start a new board'}
              >
                Skip
              </button>
              <button
                className="text-button restart-button"
                type="button"
                onClick={startNewBoard}
                disabled={coveredCount === 0 && slotPieceType === null && pieceType === 'cross'}
              >
                Restart
              </button>
            </div>
          </div>

          <div className="board-shell">
            <span className="axis-corner" aria-hidden="true"></span>
            <div className="row-labels" aria-hidden="true">
              {Array.from({ length: BOARD_SIZE }, (_, index) => <span key={index}>{index + 1}</span>)}
            </div>
            <div className="board-grid" ref={boardGridRef} role="grid" aria-label="7 by 7 bingo board">
              {board.map((row, rowIndex) =>
                row.map((covered, colIndex) => {
                  const center = { row: rowIndex, col: colIndex }
                  const placementCenter = pieceType
                    ? getPlacementCenter(pieceType, center)
                    : center
                  const key = `${rowIndex}-${colIndex}`
                  const preview = previewCells.get(key)
                  const isRecommended = recommendation?.center.row === rowIndex && recommendation.center.col === colIndex
                  const cellClass = [
                    'board-cell',
                    covered ? 'is-covered' : '',
                    preview === false
                      ? isAutomaticSuggestion
                        ? 'is-suggested-new'
                        : 'is-preview-new'
                      : '',
                    preview === true
                      ? isAutomaticSuggestion
                        ? 'is-suggested-overlap'
                        : 'is-preview-overlap'
                      : '',
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
                      onMouseEnter={() => setCursorPosition(placementCenter)}
                      onMouseLeave={() => setCursorPosition(null)}
                      onFocus={() => setHoveredPosition(placementCenter)}
                      onBlur={() => setHoveredPosition(null)}
                      onClick={() => setSelectedPosition(placementCenter)}
                      onDoubleClick={() => commitPlacement(placementCenter)}
                    />
                  )
                }),
              )}
            </div>
            <div className="column-labels" aria-hidden="true">
              {LETTERS.map((letter) => <span key={letter}>{letter}</span>)}
            </div>
          </div>

          <div className="board-legend" aria-label="Board legend">
            <span><i className="legend-covered" /> Covered</span>
            <span><i className="legend-new" /> Selected preview</span>
            <span><i className="legend-suggested" /> Recommendation</span>
            <span><i className="legend-overlap" /> Overlap</span>
          </div>
          <p className="board-hint">Click to preview · Double-click to place</p>
          <p className="board-scroll-note">Scroll over the board to cycle the hand piece.</p>
        </section>

        <aside className="analysis-column board-analysis" aria-label="Board analysis">
          <section className="recommendation-section" aria-live="polite">
            <div className="panel-heading recommendation-heading">
              <div>
                <p className="section-kicker">ADAPTIVE HEURISTIC</p>
                <h2>Recommended placement</h2>
              </div>
              <span className="recommendation-tag">TOP PICK</span>
            </div>

            {recommendation && pieceType ? (
              <>
                <button
                  className={`recommended-move ${selectedPosition?.row === recommendation.center.row && selectedPosition.col === recommendation.center.col ? 'is-selected' : ''} ${dismissedHoverPosition?.row === recommendation.center.row && dismissedHoverPosition.col === recommendation.center.col ? 'is-hover-dismissed' : ''}`}
                  type="button"
                  aria-label={`Select recommended placement ${positionLabel(recommendation.center)}`}
                  onMouseEnter={() => {
                    setDismissedHoverPosition(null)
                    setHoveredPosition(recommendation.center)
                  }}
                  onMouseLeave={() => {
                    setHoveredPosition(null)
                    setDismissedHoverPosition(null)
                  }}
                  onFocus={() => {
                    setDismissedHoverPosition(null)
                    setHoveredPosition(recommendation.center)
                  }}
                  onBlur={() => {
                    setHoveredPosition(null)
                    setDismissedHoverPosition(null)
                  }}
                  onClick={() => toggleRecommendation(recommendation.center)}
                >
                  <strong>{positionLabel(recommendation.center)}</strong>
                  <p>{recommendation.explanation}</p>
                </button>
                <div className="move-facts">
                  <div><strong>{recommendation.newCells}</strong><span>new tiles</span></div>
                  <div><strong>{recommendation.overlaps}</strong><span>overlaps</span></div>
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
                {slotPieceType && (
                  <p className="stored-piece-context">
                    Stored {PIECE_OPTIONS.find((option) => option.type === slotPieceType)?.name} can be swapped in before placing.
                  </p>
                )}
              </>
            ) : (
              <p className="empty-note">Select a piece in hand to calculate recommendations.</p>
            )}

            {recommendations.length > 1 && (
              <div className="alternatives">
                <p className="alternatives-title">Alternative candidates</p>
                <div className="alternative-candidates">
                  {recommendations.slice(1, 4).map((candidate, index) => (
                    <button
                      className={`alternative-row ${selectedPosition?.row === candidate.center.row && selectedPosition.col === candidate.center.col ? 'is-selected' : ''} ${dismissedHoverPosition?.row === candidate.center.row && dismissedHoverPosition.col === candidate.center.col ? 'is-hover-dismissed' : ''}`}
                      type="button"
                      key={`${candidate.center.row}-${candidate.center.col}`}
                      onMouseEnter={() => {
                        setDismissedHoverPosition(null)
                        setHoveredPosition(candidate.center)
                      }}
                      onMouseLeave={() => {
                        setHoveredPosition(null)
                        setDismissedHoverPosition(null)
                      }}
                      onFocus={() => {
                        setDismissedHoverPosition(null)
                        setHoveredPosition(candidate.center)
                      }}
                      onBlur={() => {
                        setHoveredPosition(null)
                        setDismissedHoverPosition(null)
                      }}
                      onClick={() => toggleRecommendation(candidate.center)}
                    >
                      <span className="alternative-rank">0{index + 2}</span>
                      <span className="alternative-position">{positionLabel(candidate.center)}</span>
                      <span className="alternative-summary">{candidate.completedLines.length > 0 ? `${candidate.completedLines.length} bingo${candidate.completedLines.length > 1 ? 's' : ''}` : `+${candidate.newCells} tiles`}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="lines-section">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">BINGO LINES</p>
                <h2>{completedLines.length > 0 ? `${completedLines.length} completed` : 'Line progress'}</h2>
              </div>
              <span className="line-count">{completedLines.length}/16</span>
            </div>
            {completedLines.length > 0 && (
              <ul className="completed-list">
                {completedLines.map((line) => (
                  <li key={line.id}>
                    <span>{line.label}</span>
                    <strong>{line.reward}</strong>
                  </li>
                ))}
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
              <p className="empty-note">No line progress yet.</p>
            ) : null}
          </section>
        </aside>
      </section>

      <footer className="page-footer">
        <span>Adaptive line heuristic · Prototype</span>
        <span>Weights are experimental, not proof of an optimal strategy.</span>
      </footer>
    </main>
  )
}

export default App
