import * as os from 'os'
import * as path from 'path'
import { ClassicLevel } from 'classic-level'
import fs from 'fs-extra'

export interface LevelDBEntry {
  key: string
  value: string
}

export interface ReadLevelDBOptions {
  maxEntries?: number
}

const DEFAULT_MAX_ENTRIES = 10000

export async function isLevelDBDirectory(dbPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dbPath)
    if (!stat.isDirectory()) {
      return false
    }

    const files = await fs.readdir(dbPath)
    return looksLikeLevelDB(files)
  } catch {
    return false
  }
}

export class LevelDBReader {
  private readonly snapshotRoot = path.join(os.tmpdir(), 'leveldb-viewer-snapshots')

  async readDatabase(dbPath: string, options: ReadLevelDBOptions = {}): Promise<LevelDBEntry[]> {
    await this.validateDatabasePath(dbPath)

    const snapshotPath = await this.createSnapshot(dbPath)
    const db = new ClassicLevel<string, string>(snapshotPath, {
      keyEncoding: 'utf8',
      valueEncoding: 'utf8'
    })

    try {
      await db.open()

      const entries: LevelDBEntry[] = []
      const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES

      for await (const [key, value] of db.iterator()) {
        entries.push({ key, value })
        if (entries.length >= maxEntries) {
          break
        }
      }

      return entries
    } catch (error) {
      throw new Error(`Unable to read LevelDB database. ${toErrorMessage(error)}`)
    } finally {
      await db.close().catch(() => undefined)
      await fs.remove(snapshotPath).catch(() => undefined)
    }
  }

  private async validateDatabasePath(dbPath: string): Promise<void> {
    let stat: fs.Stats

    try {
      stat = await fs.stat(dbPath)
    } catch (error) {
      throw new Error(`Selected path is not accessible. ${toErrorMessage(error)}`)
    }

    if (!stat.isDirectory()) {
      throw new Error('Selected path is not a directory.')
    }

    let files: string[]
    try {
      files = await fs.readdir(dbPath)
    } catch (error) {
      throw new Error(`Cannot list files in the selected directory. ${toErrorMessage(error)}`)
    }

    if (!files.length) {
      throw new Error('Selected directory is empty. Please choose a LevelDB database folder.')
    }

    if (!looksLikeLevelDB(files)) {
      throw new Error(
        'Selected directory does not look like a LevelDB database. Expected files such as MANIFEST, CURRENT, LOG, or *.ldb/*.sst.'
      )
    }
  }

  private async createSnapshot(dbPath: string): Promise<string> {
    await fs.ensureDir(this.snapshotRoot)
    await this.cleanupLegacySnapshots()

    const snapshotPath = await fs.mkdtemp(path.join(this.snapshotRoot, 'snapshot-'))

    try {
      await fs.copy(dbPath, snapshotPath, {
        errorOnExist: false,
        filter: (src) => path.basename(src) !== 'LOCK'
      })
    } catch (error) {
      await fs.remove(snapshotPath).catch(() => undefined)
      throw new Error(`Cannot create a readable database snapshot. ${toErrorMessage(error)}`)
    }

    return snapshotPath
  }

  private async cleanupLegacySnapshots(): Promise<void> {
    const entries = await fs.readdir(this.snapshotRoot).catch(() => [])

    await Promise.all(
      entries
        .filter((entry) => /^[a-f0-9]{12}$/.test(entry))
        .map((entry) => fs.remove(path.join(this.snapshotRoot, entry)).catch(() => undefined))
    )
  }
}

function looksLikeLevelDB(files: string[]): boolean {
  return files.some((file) => {
    return (
      file === 'CURRENT' ||
      file === 'LOCK' ||
      file === 'LOG' ||
      file.startsWith('MANIFEST-') ||
      file.endsWith('.ldb') ||
      file.endsWith('.sst')
    )
  })
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
