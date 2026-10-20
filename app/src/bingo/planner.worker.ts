import {
  analyzeFullBoardPlacement,
  planFullBoard,
  type FullBoardPlannerInput,
  type FullBoardPlannerResult,
} from './fullBoardPlanner'
import type { Position } from '../game'

type PlannerRequest =
  | { type: 'plan'; input: FullBoardPlannerInput }
  | { type: 'analyze'; input: FullBoardPlannerInput; center: Position }

type PlannerResponse =
  | { type: 'plan'; result?: FullBoardPlannerResult; error?: string }
  | { type: 'analyze'; candidate?: ReturnType<typeof analyzeFullBoardPlacement>; error?: string }

type WorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<PlannerRequest>) => void,
  ): void
  postMessage(message: PlannerResponse): void
}

const workerScope = self as unknown as WorkerScope

workerScope.addEventListener('message', (event) => {
  const request = event.data
  try {
    if (request.type === 'analyze') {
      workerScope.postMessage({
        type: 'analyze',
        candidate: analyzeFullBoardPlacement(request.input, request.center),
      })
    } else {
      workerScope.postMessage({ type: 'plan', result: planFullBoard(request.input) })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The board planner failed.'
    workerScope.postMessage(request.type === 'analyze'
      ? { type: 'analyze', error: message }
      : { type: 'plan', error: message })
  }
})