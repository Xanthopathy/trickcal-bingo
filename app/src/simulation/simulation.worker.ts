import {
  runSimulationComparison,
  type SimulationInput,
} from './engine'

type WorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SimulationInput>) => void,
  ): void
  postMessage(message: { comparison?: ReturnType<typeof runSimulationComparison>; error?: string }): void
}

const workerScope = self as unknown as WorkerScope

workerScope.addEventListener('message', (event) => {
  try {
    workerScope.postMessage({ comparison: runSimulationComparison(event.data) })
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : 'The simulation failed.',
    })
  }
})
