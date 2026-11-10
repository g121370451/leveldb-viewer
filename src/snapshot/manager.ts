import * as path from 'path'
import * as os from 'os'
import { mkdir, mkdtemp, link, readFile, writeFile, readdir, stat, rm } from 'fs/promises'
import { Operation, checkCancelled, errorMessage } from '../core/operation'
import { inventory, unchanged, copyFile, SourceFile } from './files'
import { allocatedBytes } from './budget'

export interface Snapshot {
  directory: string
  files: SourceFile[]
  copiedBytes: number
  reusedBytes: number
}
const root = path.join(os.tmpdir(), 'leveldb-viewer-v2')

export class SnapshotManager {
  private workspace = ''
  private heartbeat?: NodeJS.Timeout
  private current?: Snapshot
  constructor(
    readonly source: string,
    private readonly maxBytes = 10 * 1024 ** 3,
    private readonly maxCacheBytes = 20 * 1024 ** 3
  ) {}

  async prepare(operation: Operation): Promise<Snapshot> {
    await this.initialize()
    const files = await inventory(this.source)
    const total = files.reduce((sum, file) => sum + file.size, 0)
    if (total > this.maxBytes)
      throw new Error(
        `Database files total ${(total / 1024 ** 3).toFixed(2)} GiB, above the snapshot limit. Increase leveldbViewer.maxSnapshotGB.`
      )
    const needed = files
      .filter((file) => !this.canReuse(file))
      .reduce((sum, file) => sum + file.size, 0)
    await this.checkBudget(needed)
    operation.report?.(`Database ${(total / 1024 ** 2).toFixed(1)} MiB; preparing snapshot`)
    const directory = await mkdtemp(path.join(this.workspace, 'snapshot-'))
    const result: Snapshot = { directory, files, copiedBytes: 0, reusedBytes: 0 }
    try {
      for (const file of files) await this.copySourceFile(result, file, operation)
      const after = await inventory(this.source)
      if (JSON.stringify(files) !== JSON.stringify(after))
        throw new Error(
          'Source changed during copying. Refresh again, or close the source application.'
        )
      if (
        !(await readFile(path.join(directory, 'CURRENT'))).equals(
          await readFile(path.join(this.source, 'CURRENT'))
        )
      )
        throw new Error('CURRENT changed during copying.')
      return result
    } catch (error) {
      await rm(directory, { recursive: true, force: true })
      throw error
    }
  }

  async commit(snapshot: Snapshot): Promise<string[]> {
    const previous = this.current
    this.current = snapshot
    if (previous) {
      try {
        await this.discard(previous)
      } catch (error) {
        return [`Old snapshot cleanup failed: ${errorMessage(error)}`]
      }
    }
    return []
  }
  async createIndexDirectory(): Promise<string> {
    await this.initialize()
    return mkdtemp(path.join(this.workspace, 'index-'))
  }
  async checkBudget(additional = 0): Promise<void> {
    if ((await allocatedBytes(this.workspace)) + additional > this.maxCacheBytes)
      throw new Error(
        'Viewer cache budget exceeded. Increase leveldbViewer.maxCacheGB or close this viewer to release its cache.'
      )
  }
  async discard(snapshot: Snapshot): Promise<void> {
    await rm(snapshot.directory, { recursive: true, force: true })
  }
  async dispose(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.workspace) await rm(this.workspace, { recursive: true, force: true })
  }

  private async initialize(): Promise<void> {
    if (this.workspace) return
    await mkdir(root, { recursive: true })
    await cleanupAbandoned()
    this.workspace = await mkdtemp(path.join(root, 'session-'))
    const lease = path.join(this.workspace, 'lease')
    await writeFile(lease, String(process.pid))
    this.heartbeat = setInterval(() => {
      void writeFile(lease, String(process.pid)).catch(() => undefined)
    }, 60000)
    this.heartbeat.unref()
  }
  private async copySourceFile(
    snapshot: Snapshot,
    file: SourceFile,
    operation: Operation
  ): Promise<void> {
    checkCancelled(operation)
    const target = path.join(snapshot.directory, file.name)
    // Only link immutable files between OUR snapshots. Never link a source file,
    // and never let a database engine mutate these physical snapshots.
    if (this.canReuse(file) && this.current) {
      await link(path.join(this.current.directory, file.name), target)
      snapshot.reusedBytes += file.size
      return
    }
    let lastReport = 0
    await copyFile(path.join(this.source, file.name), target, operation, (bytes) => {
      snapshot.copiedBytes += bytes
      if (Date.now() - lastReport > 150) {
        operation.report?.(
          `Copying ${file.name}: ${(snapshot.copiedBytes / 1024 ** 2).toFixed(1)} MiB copied, ${(snapshot.reusedBytes / 1024 ** 2).toFixed(1)} MiB reused`
        )
        lastReport = Date.now()
      }
    })
  }
  private canReuse(file: SourceFile): boolean {
    return (
      /\.(ldb|sst)$/.test(file.name) &&
      unchanged(
        file,
        this.current?.files.find((item) => item.name === file.name)
      )
    )
  }
}

async function cleanupAbandoned(): Promise<void> {
  for (const name of await readdir(root)) {
    if (!/^session-[a-zA-Z0-9]+$/.test(name)) continue
    const directory = path.join(root, name)
    try {
      const lease = path.join(directory, 'lease')
      if (Date.now() - (await stat(lease)).mtimeMs < 24 * 60 * 60 * 1000) continue
      const pid = Number(await readFile(lease, 'utf8'))
      if (!Number.isInteger(pid) || pid <= 0) continue
      try {
        process.kill(pid, 0)
        continue
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') continue
      }
      await rm(directory, { recursive: true, force: true })
    } catch {
      /* A concurrently retiring session is harmless. */
    }
  }
}
