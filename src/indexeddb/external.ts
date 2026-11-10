import * as path from 'path'
import { open, realpath } from 'fs/promises'
import { Bytes } from '../core/bytes'

export interface ExternalObject {
  type: string
  number?: string
  mime?: string
  size?: number
  name?: string
  modified?: string
}
export function externalObjects(data: Buffer): ExternalObject[] {
  const reader = new Bytes(data),
    result: ExternalObject[] = []
  while (reader.remaining) {
    const type = reader.byte()
    if (type === 2) {
      reader.slice()
      result.push({ type: 'FileSystemHandle' })
      continue
    }
    if (type !== 0 && type !== 1) throw new Error(`Unknown external object type ${type}`)
    const entry: ExternalObject = {
      type: type === 0 ? 'Blob' : 'File',
      number: reader.varBig().toString(),
      mime: reader.utf16(),
      size: reader.varInt()
    }
    if (type === 1) {
      entry.name = reader.utf16()
      const micros = reader.varBig()
      entry.modified = new Date(Number(micros / 1000n) - 11644473600000).toISOString()
    }
    result.push(entry)
  }
  return result
}

// External objects are read only on demand. They may have disappeared since the
// snapshot; report that explicitly instead of pretending the record is empty.
export async function readExternal(
  source: string,
  database: string,
  object: ExternalObject,
  limit: number
): Promise<Buffer> {
  if (object.number === undefined) throw new Error('This external object has no readable file.')
  const root = await realpath(source.replace(/\.leveldb$/, '.blob'))
  if (!source.endsWith('.leveldb'))
    throw new Error('Cannot determine the IndexedDB blob directory.')
  const number = BigInt(object.number)
  const target = await realpath(
    path.join(
      root,
      BigInt(database).toString(16),
      (number >> 8n).toString(16).padStart(2, '0'),
      number.toString(16)
    )
  )
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('External object resolves outside its blob directory.')
  const file = await open(target, 'r')
  try {
    const before = await file.stat()
    if (before.size > limit)
      throw new Error(
        `External object is ${before.size} bytes; increase leveldbViewer.maxValueMB to decode it.`
      )
    const data = await file.readFile()
    const after = await file.stat()
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      data.length !== before.size
    )
      throw new Error('External object changed while reading.')
    return data
  } finally {
    await file.close()
  }
}
