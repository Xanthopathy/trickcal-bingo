import {
  planFullBoard,
  type FullBoardPlannerInput,
  type FullBoardPlannerResult,
} from './fullBoardPlanner'

type WorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<FullBoardPlannerInput>) => void,
  ): void
  postMessage(message: { result?: FullBoardPlannerResult; error?: string }): void
}

const workerScope = self as unknown as WorkerScope

workerScope.addEventListener('message', (event) => {
  try {
    workerScope.postMessage({ result: planFullBoard(event.data) })
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : 'The board planner failed.',
    })
  }
})