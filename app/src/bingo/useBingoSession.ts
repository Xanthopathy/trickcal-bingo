import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BINGO_LINES,
  BOARD_SIZE,
  DEFAULT_PIECE_RATES,
  DEFAULT_PRIORITY_WEIGHTS,
  canPlacePiece,
  countLineCells,
  createEmptyBoard,
  getBoardSummary,
  getEffectiveLineWeight,
  getPlacementCells,
  placePiece,
  rankPlacements,
  type Board,
  type PieceRates,
  type PieceType,
  type Position,
  type PriorityWeights,
} from '../game'
import { PIECE_OPTIONS } from './constants'

const STORAGE_KEY = 'bingo-adaptive-board-v1'
const DEFAULT_SKIP_THRESHOLD = 39

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
    ({ type }) =>
      typeof rates[type] === 'number' &&
      Number.isFinite(rates[type]) &&
      rates[type] >= 0,
  )
}

const isPriorityWeights = (value: unknown): value is PriorityWeights => {
  if (typeof value !== 'object' || value === null) return false
  const weights = value as Record<string, unknown>
  return ['diagonal', 'priority', 'outer', 'other'].every(
    (key) =>
      typeof weights[key] === 'number' &&
      Number.isFinite(weights[key]) &&
      weights[key] >= 0,
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
            ? parsed.skipThreshold === 42
              ? DEFAULT_SKIP_THRESHOLD
              : parsed.skipThreshold
            : DEFAULT_SKIP_THRESHOLD,
      }
    }
  } catch {
    return defaultSavedState()
  }

  return defaultSavedState()
}

export function useBingoSession() {
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
      ? rankPlacements(
          savedState.board,
          savedState.pieceType,
          savedState.pieceRates,
          savedState.priorityWeights,
        )[0]?.center ?? null
      : null,
  )
  const [dismissedHoverPosition, setDismissedHoverPosition] = useState<Position | null>(null)
  const boardGridRef = useRef<HTMLDivElement>(null)

  const recommendations = useMemo(
    () => pieceType
      ? rankPlacements(board, pieceType, pieceRates, priorityWeights)
      : [],
    [board, pieceType, pieceRates, priorityWeights],
  )
  const recommendation = recommendations[0] ?? null
  const storedRecommendation = useMemo(
    () => pieceType && slotPieceType
      ? rankPlacements(board, slotPieceType, pieceRates, priorityWeights)[0] ?? null
      : null,
    [board, pieceType, slotPieceType, pieceRates, priorityWeights],
  )
  const shouldSwapForImmediateValue = Boolean(
    recommendation && storedRecommendation && storedRecommendation.score > recommendation.score,
  )
  const activePosition = cursorPosition ?? hoveredPosition ?? selectedPosition ?? null
  const isAutomaticSuggestion = cursorPosition === null
  const boardSummary = useMemo(() => getBoardSummary(board), [board])
  const { completedLines, coveredTiles: coveredCount } = boardSummary
  const progressLines = useMemo(
    () => BINGO_LINES.map((line) => ({
      line,
      count: countLineCells(board, line),
    }))
      .filter(({ count }) => count > 0 && count < BOARD_SIZE)
      .sort(
        (left, right) =>
          getEffectiveLineWeight(right.line, pieceRates, priorityWeights) * right.count -
          getEffectiveLineWeight(left.line, pieceRates, priorityWeights) * left.count,
      )
      .slice(0, 3),
    [board, pieceRates, priorityWeights],
  )
  const totalPieceRate = useMemo(
    () => Object.values(pieceRates).reduce((total, rate) => total + rate, 0),
    [pieceRates],
  )
  const previewCells = useMemo(() => {
    const cells = new Map<string, boolean>()
    if (pieceType && activePosition && canPlacePiece(pieceType, activePosition)) {
      for (const { row, col } of getPlacementCells(pieceType, activePosition)) {
        cells.set(`${row}-${col}`, board[row][col])
      }
    }
    return cells
  }, [activePosition, board, pieceType])

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
        const currentIndex = PIECE_OPTIONS.findIndex((option) => option.type === current)
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
      ) return
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

      const candidateIndexByKey: Record<string, number> = { '7': 0, '8': 1, '9': 2, '0': 3 }
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

  const selectPiece = (nextPieceType: PieceType) => {
    setPieceType(nextPieceType)
    setSelectedPosition(rankPlacements(board, nextPieceType, pieceRates, priorityWeights)[0]?.center ?? null)
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
    setSelectedPosition(rankPlacements(emptyBoard, 'cross', defaultRates, defaultWeights)[0]?.center ?? null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setSettingsOpen(false)
  }

  return {
    activePosition,
    board,
    boardGridRef,
    completedLines,
    coveredCount,
    cursorPosition,
    dismissedHoverPosition,
    history,
    hoveredPosition,
    isAutomaticSuggestion,
    pieceRates,
    pieceType,
    priorityWeights,
    progressLines,
    recommendation,
    recommendations,
    selectedPosition,
    settingsOpen,
    shouldSwapForImmediateValue,
    skipThreshold,
    slotPieceType,
    storedRecommendation,
    totalPieceRate,
    previewCells,
    commitPlacement,
    resetSiteData,
    selectPiece,
    setCursorPosition,
    setDismissedHoverPosition,
    setHoveredPosition,
    setPieceRates,
    setPriorityWeights,
    setSelectedPosition,
    setSettingsOpen,
    setSkipThreshold,
    startNewBoard,
    swapSlot,
    toggleRecommendation,
    undo,
    updatePieceRate,
    updatePriorityWeight,
  }
}

export type BingoSession = ReturnType<typeof useBingoSession>