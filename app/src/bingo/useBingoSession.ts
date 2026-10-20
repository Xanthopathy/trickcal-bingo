import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BOARD_SIZE,
  DEFAULT_PIECE_RATES,
  canPlacePiece,
  createEmptyBoard,
  getBoardSummary,
  getPlacementCells,
  placePiece,
  type Board,
  type PieceRates,
  type PieceType,
  type Position,
} from '../game'
import { SIMULATION_CHECKPOINTS, type AdaptiveStrategyId, type SimulationCheckpoint } from '../simulation/engine'
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
const DEFAULT_TRACKED_PIECE_COUNTS: Record<PieceType, number> = {
  plus: 33,
  cross: 29,
  square: 7,
  horizontal: 12,
  vertical: 13,
}

type PlacementHistoryEntry = {
  board: Board
  pieceType: PieceType
  wasTracked: boolean
}

type SavedState = {
  board: Board
  pieceType: PieceType | null
  slotPieceType: PieceType | null
  pieceRates: PieceRates
  plannerStrategy: AdaptiveStrategyId
  plannerBenchmark: SimulationCheckpoint
  skipThreshold: number
  plannerPatience: PlannerPatience
  trackedPieceCounts: Record<PieceType, number>
  trackingMode: boolean
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

const isPieceCounts = (value: unknown): value is Record<PieceType, number> => {
  if (typeof value !== 'object' || value === null) return false
  const counts = value as Record<string, unknown>
  return PIECE_OPTIONS.every(
    ({ type }) =>
      typeof counts[type] === 'number' &&
      Number.isInteger(counts[type]) &&
      counts[type] >= 0,
  )
}

const isAdaptiveStrategy = (value: unknown): value is AdaptiveStrategyId =>
  value === 'adaptive-fill' || value === 'adaptive-priority' || value === 'adaptive-hybrid'

const isSimulationCheckpoint = (value: unknown): value is SimulationCheckpoint =>
  SIMULATION_CHECKPOINTS.some((checkpoint) => checkpoint === value)

const isPlannerPatience = (value: unknown): value is PlannerPatience =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5

const defaultSavedState = (): SavedState => ({
  board: createEmptyBoard(),
  pieceType: 'cross',
  slotPieceType: null,
  pieceRates: { ...DEFAULT_PIECE_RATES },
  plannerStrategy: 'adaptive-hybrid',
  plannerBenchmark: 39,
  skipThreshold: DEFAULT_SKIP_THRESHOLD,
  plannerPatience: DEFAULT_PLANNER_PATIENCE,
  trackedPieceCounts: { ...DEFAULT_TRACKED_PIECE_COUNTS },
  trackingMode: false,
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
        plannerStrategy:
          'plannerStrategy' in parsed && isAdaptiveStrategy(parsed.plannerStrategy)
            ? parsed.plannerStrategy
            : 'adaptive-hybrid',
        plannerBenchmark:
          'plannerBenchmark' in parsed && isSimulationCheckpoint(parsed.plannerBenchmark)
            ? parsed.plannerBenchmark
            : 39,
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
        trackedPieceCounts:
          'trackedPieceCounts' in parsed && isPieceCounts(parsed.trackedPieceCounts)
            ? parsed.trackedPieceCounts
            : { ...DEFAULT_TRACKED_PIECE_COUNTS },
        trackingMode:
          'trackingMode' in parsed && typeof parsed.trackingMode === 'boolean'
            ? parsed.trackingMode
            : false,
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
  const [plannerStrategy, setPlannerStrategy] = useState(savedState.plannerStrategy)
  const [plannerBenchmark, setPlannerBenchmark] = useState(savedState.plannerBenchmark)
  const [skipThreshold, setSkipThreshold] = useState(savedState.skipThreshold)
  const [plannerPatience, setPlannerPatience] = useState(savedState.plannerPatience)
  const [trackedPieceCounts, setTrackedPieceCounts] = useState(savedState.trackedPieceCounts)
  const [trackingMode, setTrackingMode] = useState(savedState.trackingMode)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [history, setHistory] = useState<PlacementHistoryEntry[]>([])
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
  const plannerKey = JSON.stringify({ board, pieceType, slotPieceType, pieceRates, plannerStrategy, plannerBenchmark, skipThreshold, plannerPatience })

  const recordPlacement = useCallback((placedPieceType: PieceType) => {
    setHistory((previous) => [...previous, {
      board,
      pieceType: placedPieceType,
      wasTracked: trackingMode,
    }].slice(-30))
    if (trackingMode) {
      setTrackedPieceCounts((previous) => ({
        ...previous,
        [placedPieceType]: previous[placedPieceType] + 1,
      }))
    }
  }, [board, trackingMode])

  const undo = useCallback(() => {
    const previousPlacement = history.at(-1)
    if (!previousPlacement) return
    setBoard(previousPlacement.board)
    setHistory((previous) => previous.slice(0, -1))
    if (previousPlacement.wasTracked) {
      setTrackedPieceCounts((previous) => ({
        ...previous,
        [previousPlacement.pieceType]: Math.max(0, previous[previousPlacement.pieceType] - 1),
      }))
    }
    setSelectedPosition(null)
    setCursorPosition(null)
    setHoveredPosition(null)
    setDismissedHoverPosition(null)
    setLastBoardClick(null)
  }, [history])

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
    worker.postMessage({ board, hand: pieceType, stored: slotPieceType, pieceRates, plannerStrategy, benchmarkTiles: plannerBenchmark, skipThreshold, patience: plannerPatience })
    return () => {
      worker.terminate()
      if (plannerWorkerRef.current === worker) plannerWorkerRef.current = null
    }
  }, [board, pieceType, slotPieceType, pieceRates, plannerStrategy, plannerBenchmark, skipThreshold, plannerPatience, plannerKey])

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
  const displayedPieceCounts = useMemo(() => {
    const counts = { ...trackedPieceCounts }
    if (trackingMode && pieceType) counts[pieceType] += 1
    if (trackingMode && slotPieceType) counts[slotPieceType] += 1
    return counts
  }, [pieceType, slotPieceType, trackedPieceCounts, trackingMode])
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
        JSON.stringify({ board, pieceType, slotPieceType, pieceRates, plannerStrategy, plannerBenchmark, skipThreshold, plannerPatience, trackedPieceCounts, trackingMode }),
      )
    } catch {
      // Continue using the board if browser storage is unavailable.
    }
  }, [board, pieceType, slotPieceType, pieceRates, plannerStrategy, plannerBenchmark, skipThreshold, plannerPatience, trackedPieceCounts, trackingMode])

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
        undo()
        event.preventDefault()
        return
      }

      if (key === 'p') {
        const center = hoveredPosition ?? selectedPosition
        if (center && pieceType) {
          recordPlacement(pieceType)
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
  }, [board, cursorPosition, hoveredPosition, pieceType, recommendations, recordPlacement, selectedPosition, slotPieceType, undo])

  const commitPlacement = (center: Position | null) => {
    if (!center || !pieceType) return
    recordPlacement(pieceType)
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

  const skipBoard = () => {
    if (trackingMode && slotPieceType) {
      setTrackedPieceCounts((previous) => ({
        ...previous,
        [slotPieceType]: previous[slotPieceType] + 1,
      }))
    }
    startNewBoard()
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

  const updateTrackedPieceCount = (piece: PieceType, value: number) => {
    const count = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
    const activeContribution = trackingMode
      ? (pieceType === piece ? 1 : 0) + (slotPieceType === piece ? 1 : 0)
      : 0
    setTrackedPieceCounts((previous) => ({
      ...previous,
      [piece]: Math.max(0, count - activeContribution),
    }))
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

  const resetSettings = () => {
    setPieceRates({ ...DEFAULT_PIECE_RATES })
    setPlannerStrategy('adaptive-hybrid')
    setPlannerBenchmark(39)
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
    setTrackedPieceCounts({ ...DEFAULT_TRACKED_PIECE_COUNTS })
    setTrackingMode(false)
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
    trackedPieceCounts,
    displayedPieceCounts,
    trackingMode,
    plannerError,
    plannerPatience,
    plannerStrategy,
    plannerBenchmark,
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
    updateTrackedPieceCount,
    setTrackingMode,
    setPlannerStrategy,
    setPlannerBenchmark,
    setPlannerPatience,
    setSelectedPosition,
    setSettingsOpen,
    setSkipThreshold,
    startNewBoard,
    skipBoard,
    swapSlot,
    toggleRecommendation,
    undo,
    updatePieceRate,
  }
}

export type BingoSession = ReturnType<typeof useBingoSession>