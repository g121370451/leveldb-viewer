import { DatabaseInfo } from '../indexeddb/catalog'
import { ExternalObject } from '../indexeddb/external'

export interface DatabaseSummary {
  kind: 'leveldb' | 'indexeddb'
  comparator: string
  count: number
  databases: DatabaseInfo[]
  copiedBytes: number
  reusedBytes: number
  capturedAt: string
  warnings: string[]
}
export interface PageRequest {
  cursor?: string
  database?: string
  store?: string
  query?: string
  limit?: number
}
export interface EntryPreview {
  id: string
  key: string
  bytes: number
  preview: string
}
export interface Page {
  entries: EntryPreview[]
  cursor?: string
  scanned: number
  undecodable: number
  hasMore: boolean
}
export interface Detail {
  id: string
  key: string
  keyHex: string
  valueHex: string
  value: string
  bytes: number
  warning?: string
  external: ExternalObject[]
}
