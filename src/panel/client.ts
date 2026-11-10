import { Worker } from 'worker_threads'
import * as path from 'path'

interface Pending {
  resolve: (value: any) => void
  reject: (error: Error) => void
  progress?: (message: string) => void
}
export class DatabaseClient {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private sequence = 0
  private failure?: Error
  private closing?: Promise<void>
  constructor(
    source: string,
    maxSnapshotBytes: number,
    maxValueBytes: number,
    maxCacheBytes: number
  ) {
    this.worker = new Worker(path.join(__dirname, '..', 'database', 'worker.js'), {
      workerData: { source, maxSnapshotBytes, maxValueBytes, maxCacheBytes }
    })
    this.worker.on('message', (message) => {
      const pending = this.pending.get(message.id)
      if (!pending) return
      if (message.progress !== undefined) {
        pending.progress?.(message.progress)
        return
      }
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error))
      else pending.resolve(message.result)
    })
    this.worker.on('error', (error) => this.fail(error))
    this.worker.on('exit', (code) =>
      this.fail(new Error(`Database worker exited (${code}). Reopen the viewer.`))
    )
  }
  call<T>(method: string, args: unknown[] = [], progress?: (message: string) => void): Promise<T> {
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      this.pending.set(id, { resolve, reject, progress })
      this.worker.postMessage({ id, method, args })
    })
  }
  cancel(): void {
    this.worker.postMessage({ method: 'cancel' })
  }
  dispose(): Promise<void> {
    if (!this.closing) this.closing = this.close()
    return this.closing
  }
  private async close(): Promise<void> {
    this.cancel()
    try {
      await this.call('dispose')
    } finally {
      await this.worker.terminate()
    }
  }
  private fail(error: Error): void {
    this.failure = error
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}
