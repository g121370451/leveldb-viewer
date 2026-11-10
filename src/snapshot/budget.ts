import { readdir, stat } from 'fs/promises'
import * as path from 'path'

// Count hard-linked immutable table files once within this viewer session.
export async function allocatedBytes(directory: string, seen = new Set<string>()): Promise<number> {
  let total = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      total += await allocatedBytes(filename, seen)
      continue
    }
    const info = await stat(filename).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    })
    if (!info) continue // The private query engine may compact between checks.
    const identity = `${info.dev}/${info.ino}`
    if (info.ino && seen.has(identity)) continue
    seen.add(identity)
    total += info.size
  }
  return total
}
