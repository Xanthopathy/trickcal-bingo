import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BOARD_SIZE,
  DEFAULT_PIECE_RATES,
  DEFAULT_PRIORITY_WEIGHTS,
  canPlacePiece,
  createEmptyBoard,
  getBoardSummary,
  getPlacementCells,
  placePiece,
  type Board,
  type PieceRates,
  type PieceType,
  type Position,
  type PriorityWeights,
} from '../game'
import { PIECE_OPTIONS } from './constants'
import {
  DEFAULT_PLANNER_PATIENCE,
  MIN_MEANINGFUL_COVERAGE_DIFFERENCE,
  type FullBoardCandidate,
  type FullBoardPlannerResult,
  type PlannerPatience,
} from './fullBoardPlanner'

const STORAGE_KEY = 'bingo-adaptive-board-v1'
const DEFAULT_SKIP_THRESHOLD = 39

type SavedState = {
  board: Board
  pieceType: PieceType | null
  slotPieceType: PieceType | null
  pieceRates: PieceRates
  priorityWeights: PriorityWeights
  skipThreshold: number
  plannerPatience: PlannerPatience
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

const isPlannerPatience = (value: unknown): value is PlannerPatience =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5

const defaultSavedState = (): SavedState => ({
  board: createEmptyBoard(),
  pieceType: 'cross',
  slotPieceType: null,
  pieceRates: { ...DEFAULT_PIECE_RATES },
  priorityWeights: { ...DEFAULT_PRIORITY_WEIGHTS },
  skipThreshold: DEFAULT_SKIP_THRESHOLD,
  plannerPatience: DEFAULT_PLANNER_PATIENCE,
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
        plannerPatience:
          'plannerPatience' in parsed && isPlannerPatience(parsed.plannerPatience)
            ? parsed.plannerPatience
            : DEFAULT_PLANNER_PATIENCE,
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
  const [plannerPatience, setPlannerPatience] = useState(savedState.plannerPatience)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [history, setHistory] = useState<Board[]>([])
  const [lastBoardClick, setLastBoardClick] = useState<Position | null>(null)
  const [hoveredPosition, setHoveredPosition] = useState<Position | null>(null)
  const [cursorPosition, setCursorPosition] = useState<Position | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [dismissedHoverPosition, setDismissedHoverPosition] = useState<Position | null>(null)
  const [plannerResult, setPlannerResult] = useState<{
    key: string
    result?: FullBoardPlannerResult
    error?: string
  } | null>(null)
  const boardGridRef = useRef<HTMLDivElement>(null)
  const plannerWorkerRef = useRef<Worker | null>(null)
  const plannerKey = JSON.stringify({ board, pieceType, slotPieceType, pieceRates, plannerPatience })

  useEffect(() => {
    if (!pieceType) return
    const worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' })
    plannerWorkerRef.current = worker
    worker.onmessage = (event: MessageEvent<{ result?: FullBoardPlannerResult; error?: string }>) => {
      if (plannerWorkerRef.current !== worker) return
      setPlannerResult({ key: plannerKey, ...event.data })
      const firstRecommendation = event.data.result?.handRecommendations[0]
      if (firstRecommendation) {
        setSelectedPosition((current) => current ?? firstRecommendation.center)
      }
      worker.terminate()
      plannerWorkerRef.current = null
    }
    worker.onerror = () => {
      if (plannerWorkerRef.current !== worker) return
      setPlannerResult({ key: plannerKey, error: 'The sampled lookahead planner stopped unexpectedly.' })
      worker.terminate()
      plannerWorkerRef.current = null
    }
    worker.postMessage({ board, hand: pieceType, stored: slotPieceType, pieceRates, patience: plannerPatience })
    return () => {
      worker.terminate()
      if (plannerWorkerRef.current === worker) plannerWorkerRef.current = null
    }
  }, [board, pieceType, slotPieceType, pieceRates, plannerPatience, plannerKey])

  const plannerResultIsCurrent = plannerResult?.key === plannerKey
  const recommendations = useMemo<FullBoardCandidate[]>(
    () => pieceType && plannerResultIsCurrent
      ? plannerResult.result?.handRecommendations ?? []
      : [],
    [pieceType, plannerResult, plannerResultIsCurrent],
  )
  const storedRecommendations = useMemo<FullBoardCandidate[]>(
    () => pieceType && plannerResultIsCurrent
      ? plannerResult.result?.storedRecommendations ?? []
      : [],
    [pieceType, plannerResult, plannerResultIsCurrent],
  )
  const isPlannerThinking = Boolean(pieceType && !plannerResultIsCurrent)
  const plannerError = plannerResultIsCurrent ? plannerResult.error ?? null : null
  const recommendation = recommendations[0] ?? null
  const storedRecommendation = storedRecommendations[0] ?? null
  const shouldSwapForHigherCoverage = Boolean(
    recommendation && storedRecommendation &&
    storedRecommendation.projectedCoverage - recommendation.projectedCoverage >= MIN_MEANINGFUL_COVERAGE_DIFFERENCE,
  )
  const activePosition = hoveredPosition ?? selectedPosition ?? null
  const isRecommendationPreview = Boolean(
    activePosition &&
    recommendations.slice(0, 4).some(
      ({ center }) => center.row === activePosition.row && center.col === activePosition.col,
    ),
  )
  const boardSummary = useMemo(() => getBoardSummary(board), [board])
  const { completedLines, coveredTiles: coveredCount } = boardSummary
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
        JSON.stringify({ board, pieceType, slotPieceType, pieceRates, priorityWeights, skipThreshold, plannerPatience }),
      )
    } catch {
      // Continue using the board if browser storage is unavailable.
    }
  }, [board, pieceType, slotPieceType, pieceRates, priorityWeights, skipThreshold, plannerPatience])

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
      setLastBoardClick(null)
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
        setSelectedPosition(null)
        setCursorPosition(null)
        setHoveredPosition(null)
        setDismissedHoverPosition(null)
        setLastBoardClick(null)
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
        setSelectedPosition(null)
        setCursorPosition(null)
        setHoveredPosition(null)
        setDismissedHoverPosition(null)
        setLastBoardClick(null)
        event.preventDefault()
        return
      }

      if (key === 'z') {
        const previousBoard = history.at(-1)
        if (previousBoard) {
          setBoard(previousBoard)
          setHistory((previous) => previous.slice(0, -1))
          setSelectedPosition(null)
          setCursorPosition(null)
          setHoveredPosition(null)
          setDismissedHoverPosition(null)
          setLastBoardClick(null)
        }
        event.preventDefault()
        return
      }

      if (key === 'p') {
        const center = hoveredPosition ?? selectedPosition
        if (center && pieceType) {
          setHistory((previous) => [...previous, board].slice(-30))
          const nextBoard = placePiece(board, pieceType, center)
          setBoard(nextBoard)
          setPieceType(null)
          setSelectedPosition(null)
          setCursorPosition(null)
          setHoveredPosition(null)
          setDismissedHoverPosition(null)
          setLastBoardClick(null)
        }
        event.preventDefault()
        return
      }

      const candidateIndexByKey: Record<string, number> = { '7': 0, '8': 1, '9': 2, '0': 3 }
      const candidateIndex = candidateIndexByKey[key]
      if (candidateIndex !== undefined && pieceType) {
        const candidate = recommendations[candidateIndex]
        if (candidate) {
          const isSelected =
            selectedPosition?.row === candidate.center.row &&
            selectedPosition?.col === candidate.center.col
          setSelectedPosition(isSelected ? null : candidate.center)
          setCursorPosition(null)
          setHoveredPosition(null)
          setDismissedHoverPosition(isSelected ? candidate.center : null)
          setLastBoardClick(null)
          event.preventDefault()
        }
        return
      }

      if (key === 'escape') {
        setSelectedPosition(null)
        setCursorPosition(null)
        setHoveredPosition(null)
        setDismissedHoverPosition(null)
        setLastBoardClick(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [board, cursorPosition, history, hoveredPosition, pieceType, recommendations, selectedPosition, slotPieceType])

  const commitPlacement = (center: Position | null) => {
    if (!center || !pieceType) return
    setHistory((previous) => [...previous, board].slice(-30))
    const nextBoard = placePiece(board, pieceType, center)
    setBoard(nextBoard)
    setPieceType(null)
    setSelectedPosition(null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setLastBoardClick(null)
  }

  const clickBoardPosition = (center: Position) => {
    const isSecondClick =
      lastBoardClick?.row === center.row && lastBoardClick.col === center.col
    if (isSecondClick) {
      commitPlacement(center)
      return
    }

    setLastBoardClick(center)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setSelectedPosition(center)
  }

  const undo = () => {
    const previousBoard = history.at(-1)
    if (!previousBoard) return
    setBoard(previousBoard)
    setHistory((previous) => previous.slice(0, -1))
    setSelectedPosition(null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setLastBoardClick(null)
  }

  const startNewBoard = () => {
    const emptyBoard = createEmptyBoard()
    setBoard(emptyBoard)
    setPieceType('cross')
    setSlotPieceType(null)
    setHistory([])
    setSelectedPosition(null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setLastBoardClick(null)
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
    setSelectedPosition(null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setLastBoardClick(null)
  }

  const selectPiece = (nextPieceType: PieceType) => {
    setPieceType(nextPieceType)
    setSelectedPosition(null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setLastBoardClick(null)
  }

  const toggleRecommendation = (center: Position) => {
    const isSelected =
      selectedPosition?.row === center.row && selectedPosition.col === center.col
    setSelectedPosition(isSelected ? null : center)
    setHoveredPosition(null)
    setDismissedHoverPosition(isSelected ? center : null)
    setLastBoardClick(null)
  }

  const updatePieceRate = (updatedPiece: PieceType, value: number) => {
    const nextRates = {
      ...pieceRates,
      [updatedPiece]: Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)),
    }
    setPieceRates(nextRates)
    setSelectedPosition(null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setLastBoardClick(null)
  }

  const updatePriorityWeight = (key: keyof PriorityWeights, value: number) => {
    const nextWeights = {
      ...priorityWeights,
      [key]: Math.max(0, Math.min(12, Number.isFinite(value) ? value : 0)),
    }
    setPriorityWeights(nextWeights)
  }

  const resetSettings = () => {
    setPieceRates({ ...DEFAULT_PIECE_RATES })
    setPriorityWeights({ ...DEFAULT_PRIORITY_WEIGHTS })
    setSkipThreshold(DEFAULT_SKIP_THRESHOLD)
    setPlannerPatience(DEFAULT_PLANNER_PATIENCE)
  }

  const resetSiteData = () => {
    const emptyBoard = createEmptyBoard()
    try {
      window.localStorage.clear()
    } catch {
      // Continue with an in-memory reset when browser storage is unavailable.
    }
    setBoard(emptyBoard)
    setPieceType('cross')
    setSlotPieceType(null)
    resetSettings()
    setHistory([])
    setSelectedPosition(null)
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
    isRecommendationPreview,
    isPlannerThinking,
    pieceRates,
    pieceType,
    plannerError,
    plannerPatience,
    priorityWeights,
    recommendation,
    recommendations,
    selectedPosition,
    settingsOpen,
    shouldSwapForHigherCoverage,
    skipThreshold,
    slotPieceType,
    storedRecommendation,
    totalPieceRate,
    previewCells,
    commitPlacement,
    clickBoardPosition,
    resetSiteData,
    resetSettings,
    selectPiece,
    setCursorPosition,
    setDismissedHoverPosition,
    setHoveredPosition,
    setPieceRates,
    setPriorityWeights,
    setPlannerPatience,
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