import { inventory } from './snapshot/files'

export async function isLevelDBDirectory(directory: string): Promise<boolean> {
  try {
    await inventory(directory)
    return true
  } catch {
    return false
  }
}
