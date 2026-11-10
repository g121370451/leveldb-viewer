export interface Operation {
  signal?: AbortSignal
  report?: (message: string) => void
}
export function checkCancelled(operation: Operation): void {
  if (operation.signal?.aborted) throw new Error('Operation cancelled.')
}
export function errorMessage(error: unknown): string {
  const parts: string[] = []
  const seen = new Set<unknown>()
  while (error && !seen.has(error)) {
    seen.add(error)
    parts.push(error instanceof Error ? error.message : String(error))
    error = error instanceof Error ? error.cause : undefined
  }
  return parts.join(' → ')
}
