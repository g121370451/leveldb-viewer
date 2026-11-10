import { textOrHex } from '../core/bytes'
import { errorMessage } from '../core/operation'
import { decodeValue, displayValue } from '../indexeddb/value'
import { externalKey, keyLabel, readKey, readPrefix } from '../indexeddb/keys'
import { ExternalObject, externalObjects, readExternal } from '../indexeddb/external'
import { RawRecord } from '../storage/records'
import { indexKey, RecordIndex, unpack } from './index'
import { Detail } from './types'
import { formatJson } from '../core/json'

export function label(key: Buffer, indexed: boolean): string {
  if (indexed) {
    const prefix = readPrefix(key)
    if (prefix.store !== '0' && prefix.index === '1') return keyLabel(readKey(prefix.reader))
  }
  return textOrHex(key)
}
export async function describeRecord(
  db: RecordIndex,
  id: string,
  record: RawRecord,
  indexed: boolean,
  source: string,
  maxBytes: number,
  full = false
): Promise<Detail> {
  const result: Detail = {
    id,
    key: label(record.key, indexed),
    keyHex: record.key.subarray(0, 65536).toString('hex'),
    valueHex: record.value.subarray(0, 65536).toString('hex'),
    value: '',
    bytes: record.value.length,
    external: []
  }
  if (record.value.length > maxBytes) {
    result.warning = `Value exceeds ${maxBytes} bytes; increase leveldbViewer.maxValueMB to decode it.`
    return result
  }
  try {
    if (!indexed) {
      const text = textOrHex(record.value)
      result.value = full ? text : formatJson(text.slice(0, 200000))
      if (!full && text.length > 200000)
        result.warning =
          'Text preview truncated at 200,000 characters; full-selection search still scans the complete value.'
      return result
    }
    const prefix = readPrefix(record.key)
    if (prefix.store === '0' || prefix.index !== '1') {
      result.value = textOrHex(record.value)
      return result
    }
    result.external = await getExternal(db, record.key)
    const value = await decodeValue(
      record.value,
      result.external,
      (index) => {
        const object = result.external[index]
        if (!object) throw new Error(`Missing external object ${index}.`)
        return readExternal(source, prefix.database, object, maxBytes)
      },
      maxBytes
    )
    result.value = displayValue(value, full)
  } catch (error) {
    result.warning = `Cannot decode this record: ${errorMessage(error)}`
  }
  return result
}
export async function getExternal(db: RecordIndex, key: Buffer): Promise<ExternalObject[]> {
  const value = await db.get(indexKey(externalKey(key), true))
  if (!value) return []
  const record = unpack(value)
  return record.deleted ? [] : externalObjects(record.value)
}
