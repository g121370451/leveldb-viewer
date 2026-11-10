import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { lstat, readdir, readFile } from 'fs/promises'
import * as path from 'path'
import { Operation, checkCancelled } from '../core/operation'

export interface SourceFile {
  name: string
  size: number
  mtime: number
  inode: number
  birthtime: number
}
export async function inventory(source: string): Promise<SourceFile[]> {
  const current = (await readFile(path.join(source, 'CURRENT'), 'utf8')).trim()
  if (!/^MANIFEST-\d+$/.test(current))
    throw new Error('Invalid CURRENT file. Select a complete LevelDB directory.')
  const names = (await readdir(source))
    .filter((name) => name === 'CURRENT' || name === current || /^\d+\.(log|ldb|sst)$/.test(name))
    .sort()
  if (!names.includes(current)) throw new Error('The MANIFEST referenced by CURRENT is missing.')
  return Promise.all(
    names.map(async (name) => {
      const stat = await lstat(path.join(source, name))
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error(`Expected a regular database file: ${name}`)
      return {
        name,
        size: stat.size,
        mtime: stat.mtimeMs,
        inode: stat.ino,
        birthtime: stat.birthtimeMs
      }
    })
  )
}
export function unchanged(a: SourceFile, b: SourceFile | undefined): boolean {
  return (
    !!b &&
    a.size === b.size &&
    a.mtime === b.mtime &&
    a.inode === b.inode &&
    a.birthtime === b.birthtime
  )
}
export async function copyFile(
  source: string,
  target: string,
  operation: Operation,
  progress: (bytes: number) => void
): Promise<void> {
  checkCancelled(operation)
  const input = createReadStream(source)
  input.on('data', (data) => progress(data.length))
  await pipeline(input, createWriteStream(target, { flags: 'wx' }), { signal: operation.signal })
}
