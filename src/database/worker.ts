import { parentPort, workerData } from 'worker_threads'
import { DatabaseSession } from './session'
import { errorMessage } from '../core/operation'
import { PageRequest } from './types'

const port = parentPort!
const session = new DatabaseSession(
  workerData.source,
  workerData.maxSnapshotBytes,
  workerData.maxValueBytes,
  workerData.maxCacheBytes
)
let current: AbortController | undefined
let queue = Promise.resolve()
port.on('message', (message: { id: number; method: string; args: unknown[] }) => {
  if (message.method === 'cancel') {
    current?.abort()
    return
  }
  queue = queue.then(async () => {
    current = new AbortController()
    const operation = {
      signal: current.signal,
      report: (message: string) => port.postMessage({ id: messageId, progress: message })
    }
    const messageId = message.id
    try {
      let result: unknown
      switch (message.method) {
        case 'refresh':
          result = await session.refresh(operation)
          break
        case 'page':
          result = await session.page(message.args[0] as PageRequest, operation)
          break
        case 'filter':
          result = await session.filter(
            message.args[0] as string[],
            message.args[1] as string,
            operation
          )
          break
        case 'detail':
          result = await session.detail(message.args[0] as string)
          break
        case 'attachment':
          result = await session.attachment(message.args[0] as string, message.args[1] as number)
          break
        case 'dispose':
          await session.dispose()
          break
        default:
          throw new Error('Unknown database operation.')
      }
      port.postMessage({ id: message.id, result })
    } catch (error) {
      port.postMessage({ id: message.id, error: errorMessage(error) })
    } finally {
      current = undefined
    }
  })
})
