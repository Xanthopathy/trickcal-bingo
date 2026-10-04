import { useEffect, useRef, useState } from 'react'
import {
  BINGO_LINES,
  BOARD_SIZE,
  DEFAULT_PIECE_RATES,
  DEFAULT_PRIORITY_WEIGHTS,
  PIECES,
  canPlacePiece,
  countLineCells,
  createEmptyBoard,
  getEffectiveLineWeight,
  getPlacementCenter,
  getCompletedLines,
  placePiece,
  rankPlacements,
  type Board,
  type PieceRates,
  type PieceType,
  type PriorityWeights,
  type Position,
} from './game'
import './App.css'

const STORAGE_KEY = 'bingo-adaptive-board-v1'
const DEFAULT_SKIP_THRESHOLD = 42
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
  pieceRates: PieceRates
  priorityWeights: PriorityWeights
  skipThreshold: number
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

const isPieceRates = (value: unknown): value is PieceRates => {
  if (typeof value !== 'object' || value === null) return false
  const rates = value as Record<string, unknown>
  return PIECE_OPTIONS.every(
    ({ type }) => typeof rates[type] === 'number' && Number.isFinite(rates[type]) && rates[type] >= 0,
  )
}

const isPriorityWeights = (value: unknown): value is PriorityWeights => {
  if (typeof value !== 'object' || value === null) return false
  const weights = value as Record<string, unknown>
  return ['diagonal', 'priority', 'outer', 'other'].every(
    (key) => typeof weights[key] === 'number' && Number.isFinite(weights[key]) && weights[key] >= 0,
  )
}

const defaultSavedState = (): SavedState => ({
  board: createEmptyBoard(),
  pieceType: 'cross',
  slotPieceType: null,
  pieceRates: { ...DEFAULT_PIECE_RATES },
  priorityWeights: { ...DEFAULT_PRIORITY_WEIGHTS },
  skipThreshold: DEFAULT_SKIP_THRESHOLD,
})

const readSavedState = (): SavedState => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return defaultSavedState()
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
        pieceRates:
          'pieceRates' in parsed && isPieceRates(parsed.pieceRates)
            ? parsed.pieceRates
            : { ...DEFAULT_PIECE_RATES },
        priorityWeights:
          'priorityWeights' in parsed && isPriorityWeights(parsed.priorityWeights)
            ? parsed.priorityWeights
            : { ...DEFAULT_PRIORITY_WEIGHTS },
        skipThreshold:
          'skipThreshold' in parsed &&
            typeof parsed.skipThreshold === 'number' &&
            Number.isInteger(parsed.skipThreshold) &&
            parsed.skipThreshold >= 1 &&
            parsed.skipThreshold <= BOARD_SIZE * BOARD_SIZE
            ? parsed.skipThreshold
            : DEFAULT_SKIP_THRESHOLD,
      }
    }
  } catch {
    return defaultSavedState()
  }

  return defaultSavedState()
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
  const [pieceRates, setPieceRates] = useState(savedState.pieceRates)
  const [priorityWeights, setPriorityWeights] = useState(savedState.priorityWeights)
  const [skipThreshold, setSkipThreshold] = useState(savedState.skipThreshold)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [history, setHistory] = useState<Board[]>([])
  const [hoveredPosition, setHoveredPosition] = useState<Position | null>(null)
  const [cursorPosition, setCursorPosition] = useState<Position | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(() =>
    savedState.pieceType
      ? rankPlacements(savedState.board, savedState.pieceType, savedState.pieceRates, savedState.priorityWeights)[0]?.center ?? null
      : null,
  )
  const [dismissedHoverPosition, setDismissedHoverPosition] = useState<Position | null>(null)
  const boardGridRef = useRef<HTMLDivElement>(null)

  const recommendations = pieceType
    ? rankPlacements(board, pieceType, pieceRates, priorityWeights)
    : []
  const recommendation = recommendations[0] ?? null
  const storedRecommendation = pieceType && slotPieceType
    ? rankPlacements(board, slotPieceType, pieceRates, priorityWeights)[0] ?? null
    : null
  const shouldSwapForImmediateValue = Boolean(
    recommendation && storedRecommendation && storedRecommendation.score > recommendation.score,
  )
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
        getEffectiveLineWeight(right.line, pieceRates, priorityWeights) * right.count -
        getEffectiveLineWeight(left.line, pieceRates, priorityWeights) * left.count,
    )
    .slice(0, 3)
  const totalPieceRate = Object.values(pieceRates).reduce((total, rate) => total + rate, 0)

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ board, pieceType, slotPieceType, pieceRates, priorityWeights, skipThreshold }),
      )
    } catch {
      // Continue using the board if browser storage is unavailable.
    }
  }, [board, pieceType, slotPieceType, pieceRates, priorityWeights, skipThreshold])

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
        setSelectedPosition(rankPlacements(board, nextPieceType, pieceRates, priorityWeights)[0]?.center ?? null)
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
          nextPieceType ? rankPlacements(board, nextPieceType, pieceRates, priorityWeights)[0]?.center ?? null : null,
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
            pieceType ? rankPlacements(previousBoard, pieceType, pieceRates, priorityWeights)[0]?.center ?? null : null,
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
        setSelectedPosition(rankPlacements(emptyBoard, 'cross', pieceRates, priorityWeights)[0]?.center ?? null)
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
          setSelectedPosition(rankPlacements(nextBoard, pieceType, pieceRates, priorityWeights)[0]?.center ?? null)
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
        const candidate = rankPlacements(board, pieceType, pieceRates, priorityWeights)[candidateIndex]
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
  }, [board, cursorPosition, history, hoveredPosition, pieceRates, pieceType, priorityWeights, selectedPosition, slotPieceType])

  const commitPlacement = (center: Position | null) => {
    if (!center || !pieceType) return
    setHistory((previous) => [...previous, board].slice(-30))
    const nextBoard = placePiece(board, pieceType, center)
    setBoard(nextBoard)
    setSelectedPosition(rankPlacements(nextBoard, pieceType, pieceRates, priorityWeights)[0]?.center ?? null)
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
      pieceType ? rankPlacements(previousBoard, pieceType, pieceRates, priorityWeights)[0]?.center ?? null : null,
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
    setSelectedPosition(rankPlacements(emptyBoard, 'cross', pieceRates, priorityWeights)[0]?.center ?? null)
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
      nextPieceType ? rankPlacements(board, nextPieceType, pieceRates, priorityWeights)[0]?.center ?? null : null,
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

  const updatePieceRate = (updatedPiece: PieceType, value: number) => {
    const nextRates = {
      ...pieceRates,
      [updatedPiece]: Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)),
    }
    setPieceRates(nextRates)
    setSelectedPosition(
      pieceType
        ? rankPlacements(board, pieceType, nextRates, priorityWeights)[0]?.center ?? null
        : null,
    )
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
  }

  const updatePriorityWeight = (key: keyof PriorityWeights, value: number) => {
    const nextWeights = {
      ...priorityWeights,
      [key]: Math.max(0, Math.min(12, Number.isFinite(value) ? value : 0)),
    }
    setPriorityWeights(nextWeights)
    setSelectedPosition(
      pieceType
        ? rankPlacements(board, pieceType, pieceRates, nextWeights)[0]?.center ?? null
        : null,
    )
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
  }

  const resetSiteData = () => {
    const emptyBoard = createEmptyBoard()
    const defaultRates = { ...DEFAULT_PIECE_RATES }
    const defaultWeights = { ...DEFAULT_PRIORITY_WEIGHTS }
    try {
      window.localStorage.clear()
    } catch {
      // Continue with an in-memory reset when browser storage is unavailable.
    }
    setBoard(emptyBoard)
    setPieceType('cross')
    setSlotPieceType(null)
    setPieceRates(defaultRates)
    setPriorityWeights(defaultWeights)
    setSkipThreshold(DEFAULT_SKIP_THRESHOLD)
    setHistory([])
    setSelectedPosition(
      rankPlacements(emptyBoard, 'cross', defaultRates, defaultWeights)[0]?.center ?? null,
    )
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setSettingsOpen(false)
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
        <div className="header-actions">
          <span className="local-badge"><span className="status-dot" /> Saved in this browser</span>
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
                  <button className="settings-close" type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
                </div>

                <label className="setting-row">
                  <span>Tiles to skip</span>
                  <input
                    type="number"
                    min="1"
                    max="49"
                    step="1"
                    value={skipThreshold}
                    onChange={(event) => setSkipThreshold(Math.max(1, Math.min(49, Math.round(Number(event.currentTarget.value) || 1))))}
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
                          onChange={(event) => updatePieceRate(option.type, Number(event.currentTarget.value))}
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
                  {([
                    ['diagonal', 'Diagonals'],
                    ['priority', 'Row 4 / Column D'],
                    ['outer', 'Outer rows / columns'],
                    ['other', 'Other lines'],
                  ] as const).map(([key, label]) => (
                    <label className="setting-row" key={key}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min="0"
                        max="12"
                        step="0.1"
                        value={priorityWeights[key]}
                        onChange={(event) => updatePriorityWeight(key, Number(event.currentTarget.value))}
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
        </div>
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

          <div className="skip-progress" aria-label={`${coveredCount} of ${skipThreshold} tiles covered toward skip threshold`}>
            <div className="skip-progress-track">
              <span style={{ width: `${Math.min(coveredCount / skipThreshold, 1) * 100}%` }} />
              <i style={{ left: `${(skipThreshold / 49) * 100}%` }} />
            </div>
            <div className="skip-progress-labels">
              <span>Skip threshold</span>
              <span>{coveredCount} / {skipThreshold}</span>
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
                    setSelectedPosition(rankPlacements(board, option.type, pieceRates, priorityWeights)[0]?.center ?? null)
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
                disabled={coveredCount < skipThreshold}
                title={coveredCount < skipThreshold ? `Available at ${skipThreshold} covered tiles` : 'Start a new board'}
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
                {pieceType && slotPieceType && storedRecommendation && (
                  <>
                    <p className="stored-piece-context">
                      {shouldSwapForImmediateValue
                        ? `Swap in ${PIECE_OPTIONS.find((option) => option.type === slotPieceType)?.name}: it has the stronger placement on this board. Your ${PIECE_OPTIONS.find((option) => option.type === pieceType)?.name} will stay stored for later.`
                        : `Keep ${PIECE_OPTIONS.find((option) => option.type === pieceType)?.name} in hand: it has the stronger placement on this board. The stored ${PIECE_OPTIONS.find((option) => option.type === slotPieceType)?.name} remains available for later.`}
                      {' '}Future board flexibility is not simulated.
                    </p>
                    {shouldSwapForImmediateValue && (
                      <button className="swap-button" type="button" onClick={swapSlot}>
                        Swap to stored piece
                      </button>
                    )}
                  </>
                )}
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => commitPlacement(activePosition)}
                  disabled={!activePosition}
                >
                  Place at {activePosition ? positionLabel(activePosition) : '—'}
                  <span aria-hidden="true">→</span>
                </button>
                {slotPieceType && !pieceType && (
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
