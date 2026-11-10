import { ClassicLevel } from 'classic-level'
import { Bytes } from '../core/bytes'
import { Operation, checkCancelled } from '../core/operation'
import { RawRecord } from '../storage/records'
import { recordIdentity } from '../indexeddb/keys'

export type RecordIndex = ClassicLevel<Buffer, Buffer>
export function indexKey(key: Buffer, indexed: boolean): Buffer {
  return Buffer.concat([Buffer.from('r/'), indexed ? recordIdentity(key) : key])
}
export function pack(record: RawRecord): Buffer {
  const header = Buffer.alloc(13)
  header.writeBigUInt64LE(record.sequence)
  header[8] = record.deleted ? 1 : 0
  header.writeUInt32LE(record.key.length, 9)
  return Buffer.concat([header, record.key, record.value])
}
export function unpack(value: Buffer): RawRecord {
  const reader = new Bytes(value)
  const sequence = reader.take(8).readBigUInt64LE(),
    deleted = reader.byte() !== 0
  const key = reader.take(reader.take(4).readUInt32LE())
  return { sequence, deleted, key, value: reader.take(reader.remaining) }
}
export async function importRecords(
  db: RecordIndex,
  records: AsyncIterable<RawRecord>,
  indexed: boolean,
  operation: Operation,
  checkBudget: () => Promise<void> = async () => {}
): Promise<void> {
  let batch = new Map<string, { key: Buffer; record: RawRecord }>()
  let bytes = 0,
    count = 0,
    sinceBudgetCheck = 0
  async function flush(): Promise<void> {
    for (const [id, entry] of batch) {
      const old = await db.get(entry.key)
      if (old && old.readBigUInt64LE() > entry.record.sequence) batch.delete(id)
    }
    await db.batch(
      [...batch.values()].map(({ key, record }) => ({
        type: 'put' as const,
        key,
        value: pack(record)
      }))
    )
    sinceBudgetCheck += bytes
    if (sinceBudgetCheck >= 16 * 1024 ** 2) {
      await checkBudget()
      sinceBudgetCheck = 0
    }
    batch = new Map()
    bytes = 0
  }
  for await (const record of records) {
    checkCancelled(operation)
    const key = indexKey(record.key, indexed),
      id = key.toString('hex')
    const previous = batch.get(id)
    if (!previous || previous.record.sequence <= record.sequence) batch.set(id, { key, record })
    bytes += record.key.length + record.value.length
    if (batch.size >= 500 || bytes > 8 * 1024 ** 2) await flush()
    if (++count % 5000 === 0)
      operation.report?.(`Indexed ${count.toLocaleString()} physical records`)
  }
  await flush()
  await checkBudget()
}
