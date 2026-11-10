import { readFile } from 'fs/promises'
import * as path from 'path'
import { Bytes } from '../core/bytes'
import { logRecords } from './log'

export interface Manifest {
  name: string
  comparator: string
  log: bigint
  previousLog: bigint
  tables: Map<string, number>
}
export async function readManifest(directory: string): Promise<Manifest> {
  const name = (await readFile(path.join(directory, 'CURRENT'), 'utf8')).trim()
  if (!/^MANIFEST-\d+$/.test(name)) throw new Error('CURRENT does not reference a valid MANIFEST.')
  const result: Manifest = { name, comparator: '', log: 0n, previousLog: 0n, tables: new Map() }
  for await (const record of logRecords(path.join(directory, name)))
    applyEdit(result, new Bytes(record))
  if (!result.comparator) throw new Error('MANIFEST has no comparator; the database is incomplete.')
  return result
}
function applyEdit(state: Manifest, reader: Bytes): void {
  while (reader.remaining) {
    const tag = reader.varInt()
    switch (tag) {
      case 1:
        state.comparator = reader.slice().toString()
        break
      case 2:
        state.log = reader.varBig()
        break
      case 3:
      case 4:
        reader.varBig()
        break
      case 5:
        reader.varInt()
        reader.slice()
        break
      case 6:
        reader.varInt()
        state.tables.delete(reader.varBig().toString())
        break
      case 7: {
        reader.varInt()
        const number = reader.varBig().toString()
        state.tables.set(number, reader.varInt())
        reader.slice()
        reader.slice()
        break
      }
      case 9:
        state.previousLog = reader.varBig()
        break
      default:
        throw new Error(`Unsupported MANIFEST field ${tag}.`)
    }
  }
}
