import * as path from 'path'
import { readdir, stat } from 'fs/promises'
import { Bytes } from '../core/bytes'
import { Operation, checkCancelled } from '../core/operation'
import { Manifest } from './manifest'
import { logRecords } from './log'
import { tableEntries } from './table'

export interface RawRecord {
  key: Buffer
  value: Buffer
  sequence: bigint
  deleted: boolean
}
export async function* databaseRecords(
  directory: string,
  manifest: Manifest,
  operation: Operation
): AsyncGenerator<RawRecord> {
  const files = await readdir(directory)
  for (const [number, size] of manifest.tables) {
    checkCancelled(operation)
    const filename = files.find(
      (name) => /^(\d+)\.(ldb|sst)$/.test(name) && BigInt(name.split('.')[0]).toString() === number
    )
    if (!filename)
      throw new Error(`Missing table ${number}. The source may have changed during copying.`)
    const fullPath = path.join(directory, filename)
    if ((await stat(fullPath)).size !== size) throw new Error(`Table size mismatch: ${filename}`)
    operation.report?.(`Indexing ${filename}`)
    for await (const [internalKey, value] of tableEntries(fullPath, operation)) {
      if (internalKey.length < 8) throw new Error('Invalid internal table key.')
      const tag = internalKey.readBigUInt64LE(internalKey.length - 8)
      const type = Number(tag & 255n)
      if (type > 1) throw new Error(`Unsupported table value type ${type}`)
      yield { key: internalKey.subarray(0, -8), value, sequence: tag >> 8n, deleted: type === 0 }
    }
  }
  const logs = files
    .filter((name) => /^\d+\.log$/.test(name))
    .filter((name) => {
      const number = BigInt(name.split('.')[0])
      return number >= manifest.log || number === manifest.previousLog
    })
    .sort()
  for (const filename of logs) {
    operation.report?.(`Indexing ${filename}`)
    for await (const record of logRecords(path.join(directory, filename), operation))
      yield* batchRecords(record)
  }
}
export function* batchRecords(data: Buffer): Generator<RawRecord> {
  const reader = new Bytes(data)
  const sequence = reader.take(8).readBigUInt64LE()
  const count = reader.take(4).readUInt32LE()
  for (let index = 0; index < count; index++) {
    const type = reader.byte()
    if (type > 1) throw new Error(`Unsupported write batch type ${type}.`)
    const key = reader.slice()
    const value = type === 1 ? reader.slice() : Buffer.alloc(0)
    yield { key, value, deleted: type === 0, sequence: sequence + BigInt(index) }
  }
  if (reader.remaining) throw new Error('Unexpected bytes after write batch.')
}
