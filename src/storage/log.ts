import { open } from 'fs/promises'
import { maskedCrc } from './checksum'
import { checkCancelled, Operation } from '../core/operation'

// LevelDB log records can span 32 KiB blocks. A partial final record is an
// uncommitted tail; checksum failures elsewhere must never be silently ignored.
export async function* logRecords(file: string, operation: Operation = {}): AsyncGenerator<Buffer> {
  const handle = await open(file, 'r')
  let fragments: Buffer[] = []
  let fragmentBytes = 0
  let position = 0
  try {
    while (true) {
      checkCancelled(operation)
      const block = Buffer.alloc(32768)
      const { bytesRead } = await handle.read(block, 0, block.length, position)
      if (!bytesRead) break
      position += bytesRead
      let offset = 0
      while (offset + 7 <= bytesRead) {
        const crc = block.readUInt32LE(offset)
        const length = block.readUInt16LE(offset + 4)
        const type = block[offset + 6]
        if (type === 0 && length === 0) break
        if (offset + 7 + length > bytesRead) {
          if (bytesRead === block.length) throw new Error(`Invalid log fragment in ${file}`)
          break
        }
        const payload = block.subarray(offset + 7, offset + 7 + length)
        if (maskedCrc(Buffer.concat([Buffer.from([type]), payload])) !== crc)
          throw new Error(`Checksum mismatch in ${file}`)
        offset += 7 + length
        if (type === 1) {
          if (fragments.length) throw new Error('Incomplete log record.')
          yield Buffer.from(payload)
        } else if (type === 2) {
          if (fragments.length) throw new Error('Incomplete log record.')
          fragments = [Buffer.from(payload)]
          fragmentBytes = payload.length
        } else if (type === 3 || type === 4) {
          if (!fragments.length) throw new Error('Missing initial log fragment.')
          fragments.push(Buffer.from(payload))
          fragmentBytes += payload.length
          if (fragmentBytes > 256 * 1024 ** 2)
            throw new Error('Log record exceeds the 256 MiB parser limit.')
          if (type === 4) {
            yield Buffer.concat(fragments)
            fragments = []
            fragmentBytes = 0
          }
        } else throw new Error(`Unknown log record type ${type}`)
      }
      if (bytesRead < block.length) break
    }
  } finally {
    await handle.close()
  }
}
