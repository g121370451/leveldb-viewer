import { Bytes, littleInteger, utf16be } from '../core/bytes'
import { readPrefix } from './keys'

export interface IndexInfo {
  id: string
  name: string
  keyPath?: string
  unique?: boolean
  multiEntry?: boolean
}
export interface StoreInfo {
  id: string
  name: string
  keyPath?: string
  autoIncrement?: boolean
  count: number
  indexes: IndexInfo[]
}
export interface DatabaseInfo {
  id: string
  name: string
  origin?: string
  version?: string
  stores: StoreInfo[]
}

export class Catalog {
  readonly databases: DatabaseInfo[] = []
  addRecord(key: Buffer, value: Buffer): void {
    const { database, store, index, reader } = readPrefix(key)
    if (database === '0') {
      if (store !== '0' || index !== '0' || !reader.remaining) return
      const type = reader.byte()
      if (type === 201) {
        const origin = reader.utf16(),
          name = reader.utf16()
        const db = this.database(littleInteger(value).toString())
        db.origin = origin
        db.name = name
      }
      if (type === 50 && reader.remaining && reader.byte() !== 0) {
        throw new Error(
          'IndexedDB has pending scope recovery metadata. Close the source application and reopen it to finish recovery before copying.'
        )
      }
      return
    }
    const db = this.database(database)
    if (store !== '0') {
      if (index === '1') this.store(db, store).count++
      return
    }
    const type = reader.byte()
    if (type === 0) db.origin = utf16be(value)
    else if (type === 1) db.name = utf16be(value)
    else if (type === 4) db.version = new Bytes(value).varBig().toString()
    else if (type === 50) this.storeMetadata(db, reader, value)
    else if (type === 100) this.indexMetadata(db, reader, value)
  }
  private database(id: string): DatabaseInfo {
    let db = this.databases.find((item) => item.id === id)
    if (!db) {
      db = { id, name: `Database ${id}`, stores: [] }
      this.databases.push(db)
    }
    return db
  }
  private store(db: DatabaseInfo, id: string): StoreInfo {
    let store = db.stores.find((item) => item.id === id)
    if (!store) {
      store = { id, name: `Store ${id}`, count: 0, indexes: [] }
      db.stores.push(store)
    }
    return store
  }
  private storeMetadata(db: DatabaseInfo, reader: Bytes, value: Buffer): void {
    const store = this.store(db, reader.varBig().toString())
    const type = reader.byte()
    if (type === 0) store.name = utf16be(value)
    else if (type === 1) store.keyPath = keyPath(value)
    else if (type === 2) store.autoIncrement = littleInteger(value) !== 0n
  }
  private indexMetadata(db: DatabaseInfo, reader: Bytes, value: Buffer): void {
    const store = this.store(db, reader.varBig().toString())
    const id = reader.varBig().toString()
    let index = store.indexes.find((item) => item.id === id)
    if (!index) {
      index = { id, name: `Index ${id}` }
      store.indexes.push(index)
    }
    const type = reader.byte()
    if (type === 0) index.name = utf16be(value)
    else if (type === 1) index.unique = littleInteger(value) !== 0n
    else if (type === 2) index.keyPath = keyPath(value)
    else if (type === 3) index.multiEntry = littleInteger(value) !== 0n
  }
}
function keyPath(value: Buffer): string {
  if (value.length < 3 || value[0] || value[1]) return utf16be(value)
  const reader = new Bytes(value.subarray(2))
  const type = reader.byte()
  if (type === 0) return 'null'
  if (type === 1) return reader.utf16()
  if (type === 2) {
    const count = reader.varInt()
    if (count > reader.remaining) throw new Error('Invalid key path length.')
    return JSON.stringify(Array.from({ length: count }, () => reader.utf16()))
  }
  throw new Error(`Unknown IndexedDB key path type ${type}.`)
}
