import { Bytes, littleInteger } from '../core/bytes'

export interface Prefix {
  database: string
  store: string
  index: string
  reader: Bytes
}
export function readPrefix(key: Buffer): Prefix {
  const reader = new Bytes(key)
  const sizes = reader.byte()
  return {
    database: littleInteger(reader.take((sizes >> 5) + 1)).toString(),
    store: littleInteger(reader.take(((sizes >> 2) & 7) + 1)).toString(),
    index: littleInteger(reader.take((sizes & 3) + 1)).toString(),
    reader
  }
}

export type IdbKey = { type: string; value: string | number | IdbKey[] }
export function readKey(reader: Bytes, depth = 0): IdbKey {
  if (depth > 100) throw new Error('IndexedDB key nesting exceeds 100 levels.')
  const tag = reader.byte()
  switch (tag) {
    case 0:
      return { type: 'null', value: '' }
    case 1:
      return { type: 'string', value: reader.utf16() }
    case 2:
    case 3: {
      const value = reader.take(8).readDoubleLE()
      return {
        type: tag === 2 ? 'date' : 'number',
        value: Number.isFinite(value) ? value : String(value)
      }
    }
    case 6:
      return { type: 'binary', value: reader.slice().toString('hex') }
    case 4: {
      const count = reader.varInt()
      if (count > reader.remaining) throw new Error('Invalid IndexedDB array key length.')
      return {
        type: 'array',
        value: Array.from({ length: count }, () => readKey(reader, depth + 1))
      }
    }
    default:
      throw new Error(`Unsupported IndexedDB key type ${tag}.`)
  }
}
export function keyLabel(key: IdbKey): string {
  if (key.type === 'string') return String(key.value)
  if (key.type === 'array') return `[${(key.value as IdbKey[]).map(keyLabel).join(', ')}]`
  return `${key.type}: ${key.value}`
}

// Canonical identities respect the IDB comparator's decoded primary-key
// semantics (including alternative prefix lengths and -0/+0).
export function recordIdentity(key: Buffer): Buffer {
  const prefix = readPrefix(key)
  const { database, store, index, reader } = prefix
  const suffix =
    store !== '0' && ['1', '2', '3'].includes(index)
      ? JSON.stringify(readKey(reader))
      : reader.take(reader.remaining).toString('hex')
  return Buffer.from(`${database}/${store}/${index}/${suffix}`)
}
export function externalKey(key: Buffer): Buffer {
  const copy = Buffer.from(key)
  const size = copy[0]
  const position = 1 + (size >> 5) + 1 + ((size >> 2) & 7) + 1
  copy.fill(0, position, position + (size & 3) + 1)
  copy[position] = 3
  return copy
}
