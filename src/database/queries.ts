import { Operation, checkCancelled } from '../core/operation'
import { textOrHex } from '../core/bytes'
import { readPrefix } from '../indexeddb/keys'
import { readExternal } from '../indexeddb/external'
import { RecordIndex, unpack } from './index'
import { describeRecord, label, getExternal } from './detail'
import { DatabaseSummary, PageRequest, Page, Detail } from './types'

export class DatabaseQueries {
  constructor(
    private readonly db: RecordIndex,
    private readonly summary: DatabaseSummary,
    private readonly source: string,
    private readonly maxValueBytes: number
  ) {}
  async page(request: PageRequest = {}, operation: Operation = {}): Promise<Page> {
    const { db, summary } = this
    const indexed = summary.kind === 'indexeddb'
    const prefix =
      indexed && request.database && request.store
        ? Buffer.from(`r/${request.database}/${request.store}/1/`)
        : Buffer.from('r/')
    const upper = Buffer.from(prefix)
    upper[upper.length - 1]++
    const cursor = request.cursor ? validId(request.cursor) : undefined
    if (cursor && !cursor.subarray(0, prefix.length).equals(prefix))
      throw new Error('Page cursor does not belong to this selection.')
    const limit = Math.min(200, Math.max(1, request.limit ?? 100))
    const query = (request.query ?? '').trim().toLowerCase()
    const result: Page = { entries: [], scanned: 0, undecodable: 0, hasMore: false }
    for await (const [key, value] of db.iterator({
      ...(cursor ? { gt: cursor } : { gte: prefix }),
      lt: upper
    })) {
      checkCancelled(operation)
      const record = unpack(value)
      if (record.deleted) continue
      const id = key.toString('hex'),
        keyText = label(record.key, indexed)
      result.scanned++
      let preview = indexed
        ? `${record.value.length.toLocaleString()} bytes · select to decode`
        : textOrHex(record.value.subarray(0, 160))
      if (query) {
        const detail = await describeRecord(
          db,
          id,
          record,
          indexed,
          this.source,
          this.maxValueBytes,
          true
        )
        if (detail.warning) result.undecodable++
        if (result.scanned % 200 === 0)
          operation.report?.(`Searching: ${result.scanned.toLocaleString()} records scanned`)
        if (!`${keyText}\n${detail.value}`.toLowerCase().includes(query)) continue
        preview = detail.value.slice(0, 160) || detail.warning || ''
      }
      if (result.entries.length >= limit) {
        result.hasMore = true
        break
      }
      result.entries.push({ id, key: keyText, bytes: record.value.length, preview })
      result.cursor = id
      if (result.scanned % 200 === 0)
        operation.report?.(`Searching: ${result.scanned.toLocaleString()} records scanned`)
    }
    return result
  }
  async detail(id: string): Promise<Detail> {
    const { db, summary } = this
    const value = await db.get(validId(id))
    if (!value || unpack(value).deleted)
      throw new Error('Record is no longer present in this snapshot.')
    return describeRecord(
      db,
      id,
      unpack(value),
      summary.kind === 'indexeddb',
      this.source,
      this.maxValueBytes
    )
  }
  async filter(ids: string[], query: string, operation: Operation = {}): Promise<Page> {
    if (ids.length > 200) throw new Error('A page filter cannot contain more than 200 records.')
    const { db, summary } = this
    const result: Page = { entries: [], scanned: 0, undecodable: 0, hasMore: false }
    for (const id of ids) {
      checkCancelled(operation)
      const value = await db.get(validId(id))
      if (!value) continue
      const record = unpack(value)
      if (record.deleted) continue
      const detail = await describeRecord(
        db,
        id,
        record,
        summary.kind === 'indexeddb',
        this.source,
        this.maxValueBytes,
        true
      )
      result.scanned++
      if (detail.warning) result.undecodable++
      if (`${detail.key}\n${detail.value}`.toLowerCase().includes(query.toLowerCase()))
        result.entries.push({
          id,
          key: detail.key,
          bytes: detail.bytes,
          preview: detail.value.slice(0, 160)
        })
    }
    return result
  }
  async attachment(
    id: string,
    index: number
  ): Promise<{ hex: string; text: string; bytes: number }> {
    const { db, summary } = this
    if (summary.kind !== 'indexeddb') throw new Error('This database has no IndexedDB attachments.')
    const value = await db.get(validId(id))
    if (!value) throw new Error('Record not found.')
    const record = unpack(value),
      objects = await getExternal(db, record.key)
    if (!Number.isInteger(index) || !objects[index]) throw new Error('Invalid attachment index.')
    const bytes = await readExternal(
      this.source,
      readPrefix(record.key).database,
      objects[index],
      this.maxValueBytes
    )
    return {
      hex: bytes.subarray(0, 65536).toString('hex'),
      text: textOrHex(bytes.subarray(0, 65536)),
      bytes: bytes.length
    }
  }
}
function validId(id: string): Buffer {
  if (!/^(?:[a-f0-9]{2})+$/.test(id) || id.length > 1024 * 1024)
    throw new Error('Invalid record identifier.')
  const value = Buffer.from(id, 'hex')
  if (value.subarray(0, 2).toString() !== 'r/') throw new Error('Invalid record identifier prefix.')
  return value
}
