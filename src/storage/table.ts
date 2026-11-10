import { open, FileHandle } from 'fs/promises'
import { uncompress } from 'snappyjs'
import { Bytes } from '../core/bytes'
import { Operation, checkCancelled } from '../core/operation'
import { maskedCrc } from './checksum'

interface BlockHandle {
  offset: number
  length: number
}
function blockHandle(reader: Bytes): BlockHandle {
  return { offset: reader.varInt(), length: reader.varInt() }
}

async function readBlock(file: FileHandle, block: BlockHandle, fileSize: number): Promise<Buffer> {
  if (block.length > 256 * 1024 * 1024 || block.offset + block.length + 5 > fileSize)
    throw new Error('Invalid or oversized table block.')
  const data = Buffer.alloc(block.length + 5)
  const { bytesRead } = await file.read(data, 0, data.length, block.offset)
  if (bytesRead !== data.length) throw new Error('Truncated table block.')
  if (maskedCrc(data.subarray(0, -4)) !== data.readUInt32LE(data.length - 4))
    throw new Error('Table block checksum mismatch.')
  const compression = data[block.length]
  const payload = data.subarray(0, block.length)
  if (compression === 0) return payload
  if (compression === 1) return Buffer.from(uncompress(payload, 256 * 1024 * 1024))
  throw new Error(`Unsupported table compression ${compression}.`)
}

export function* blockEntries(block: Buffer): Generator<[Buffer, Buffer]> {
  if (block.length < 4) throw new Error('Invalid table restart array.')
  const count = block.readUInt32LE(block.length - 4)
  const end = block.length - 4 - count * 4
  if (end < 0) throw new Error('Invalid table restart count.')
  const reader = new Bytes(block.subarray(0, end))
  let previous = Buffer.alloc(0)
  while (reader.remaining) {
    const shared = reader.varInt(),
      unshared = reader.varInt(),
      length = reader.varInt()
    if (shared > previous.length) throw new Error('Invalid shared key prefix.')
    const key = Buffer.concat([previous.subarray(0, shared), reader.take(unshared)])
    yield [key, reader.take(length)]
    previous = key
  }
}

export async function* tableEntries(
  filename: string,
  operation: Operation
): AsyncGenerator<[Buffer, Buffer]> {
  const file = await open(filename, 'r')
  try {
    const size = (await file.stat()).size
    if (size < 48) throw new Error('Truncated table footer.')
    const footer = Buffer.alloc(48)
    await file.read(footer, 0, 48, size - 48)
    if (footer.readBigUInt64LE(40) !== 0xdb4775248b80fb57n)
      throw new Error('Unsupported table format.')
    const reader = new Bytes(footer)
    blockHandle(reader) // Meta-index is unnecessary for a complete sequential scan.
    const index = await readBlock(file, blockHandle(reader), size)
    for (const [, value] of blockEntries(index)) {
      checkCancelled(operation)
      yield* blockEntries(await readBlock(file, blockHandle(new Bytes(value)), size))
    }
  } finally {
    await file.close()
  }
}
