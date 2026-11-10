import { DatabaseQueries } from './queries'
import { ClassicLevel } from 'classic-level'
import { rm } from 'fs/promises'
import { checkCancelled, Operation, errorMessage } from '../core/operation'
import { Snapshot, SnapshotManager } from '../snapshot/manager'
import { readManifest } from '../storage/manifest'
import { databaseRecords } from '../storage/records'
import { Catalog } from '../indexeddb/catalog'
import { importRecords, RecordIndex, unpack } from './index'
import { DatabaseSummary, PageRequest, Page, Detail } from './types'

interface ActiveDatabase {
  db: RecordIndex
  directory: string
  summary: DatabaseSummary
}
export class DatabaseSession {
  private readonly snapshots: SnapshotManager
  private active?: ActiveDatabase
  constructor(
    readonly source: string,
    maxSnapshotBytes = 10 * 1024 ** 3,
    private readonly maxValueBytes = 32 * 1024 ** 2,
    maxCacheBytes = 20 * 1024 ** 3
  ) {
    this.snapshots = new SnapshotManager(source, maxSnapshotBytes, maxCacheBytes)
  }
  async refresh(operation: Operation = {}): Promise<DatabaseSummary> {
    let snapshot: Snapshot | undefined
    let next: ActiveDatabase | undefined
    try {
      snapshot = await this.prepareSnapshot(operation)
      next = await this.buildIndex(snapshot, operation)
      checkCancelled(operation)
    } catch (error) {
      if (next) await this.release(next)
      if (snapshot) await this.snapshots.discard(snapshot)
      throw error
    }
    const previous = this.active
    this.active = next
    next.summary.warnings.push(...(await this.snapshots.commit(snapshot)))
    if (previous) {
      try {
        await this.release(previous)
      } catch (error) {
        next.summary.warnings.push(`Old query index cleanup failed: ${errorMessage(error)}`)
      }
    }
    return next.summary
  }
  page(request: PageRequest = {}, operation: Operation = {}): Promise<Page> {
    return this.queries().page(request, operation)
  }
  filter(ids: string[], query: string, operation: Operation = {}): Promise<Page> {
    return this.queries().filter(ids, query, operation)
  }
  detail(id: string): Promise<Detail> {
    return this.queries().detail(id)
  }
  attachment(id: string, index: number): Promise<{ hex: string; text: string; bytes: number }> {
    return this.queries().attachment(id, index)
  }
  private queries(): DatabaseQueries {
    const { db, summary } = this.requireActive()
    return new DatabaseQueries(db, summary, this.source, this.maxValueBytes)
  }
  async dispose(): Promise<void> {
    try {
      if (this.active) await this.release(this.active)
    } finally {
      await this.snapshots.dispose()
    }
  }
  private async prepareSnapshot(operation: Operation): Promise<Snapshot> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.snapshots.prepare(operation)
      } catch (error) {
        checkCancelled(operation)
        if (attempt >= 2 || !/Source changed|CURRENT changed/.test(String(error))) throw error
        operation.report?.(`Source changed; retrying (${attempt + 1}/2)`)
      }
    }
  }
  private async buildIndex(snapshot: Snapshot, operation: Operation): Promise<ActiveDatabase> {
    const manifest = await readManifest(snapshot.directory)
    if (!['idb_cmp1', 'leveldb.BytewiseComparator'].includes(manifest.comparator))
      throw new Error(`Unsupported comparator: ${manifest.comparator}`)
    const indexed = manifest.comparator === 'idb_cmp1'
    const directory = await this.snapshots.createIndexDirectory()
    const db = new ClassicLevel<Buffer, Buffer>(directory, {
      keyEncoding: 'buffer',
      valueEncoding: 'buffer',
      compression: true
    })
    try {
      await db.open()
      await importRecords(
        db,
        databaseRecords(snapshot.directory, manifest, operation),
        indexed,
        operation,
        () => this.snapshots.checkBudget()
      )
      const catalog = new Catalog()
      let count = 0
      for await (const [, value] of db.iterator()) {
        checkCancelled(operation)
        const record = unpack(value)
        if (record.deleted) continue
        count++
        if (indexed) catalog.addRecord(record.key, record.value)
      }
      return {
        db,
        directory,
        summary: {
          kind: indexed ? 'indexeddb' : 'leveldb',
          comparator: manifest.comparator,
          count,
          databases: catalog.databases,
          copiedBytes: snapshot.copiedBytes,
          reusedBytes: snapshot.reusedBytes,
          capturedAt: new Date().toISOString(),
          warnings: []
        }
      }
    } catch (error) {
      await db.close().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
      throw error
    }
  }
  private requireActive(): ActiveDatabase {
    if (!this.active) throw new Error('Open a database first.')
    return this.active
  }
  private async release(active: ActiveDatabase): Promise<void> {
    await active.db.close()
    await rm(active.directory, { recursive: true, force: true })
  }
}
