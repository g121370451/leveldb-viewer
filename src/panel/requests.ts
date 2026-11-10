import { DatabaseClient } from './client'
import { DatabaseSummary } from '../database/types'

export async function dispatch(
  client: DatabaseClient,
  source: string,
  message: any,
  progress: (message: string) => void
): Promise<object | undefined> {
  switch (message.type) {
    case 'ready':
    case 'refresh': {
      const summary = await client.call<DatabaseSummary>('refresh', [], progress)
      return { type: 'summary', source, summary }
    }
    case 'page':
      return {
        type: 'page',
        page: await client.call('page', [validatePage(message.request)], progress)
      }
    case 'filter': {
      if (
        !Array.isArray(message.ids) ||
        message.ids.length > 200 ||
        !message.ids.every((id: unknown) => typeof id === 'string') ||
        typeof message.query !== 'string' ||
        message.query.length > 10000
      )
        throw new Error('Invalid page filter.')
      return {
        type: 'filtered',
        page: await client.call('filter', [message.ids, message.query], progress)
      }
    }
    case 'detail':
      if (typeof message.id === 'string')
        return { type: 'detail', detail: await client.call('detail', [message.id], progress) }
    case 'attachment':
      if (typeof message.id === 'string' && Number.isInteger(message.index))
        return {
          type: 'attachment',
          attachment: await client.call('attachment', [message.id, message.index], progress)
        }
  }
}

function validatePage(input: unknown): object {
  if (!input || typeof input !== 'object') return {}
  const value = input as Record<string, unknown>
  for (const name of ['database', 'store'])
    if (
      value[name] !== undefined &&
      (typeof value[name] !== 'string' || !/^\d+$/.test(value[name] as string))
    )
      throw new Error('Invalid database selection.')
  for (const name of ['cursor', 'query'])
    if (value[name] !== undefined && typeof value[name] !== 'string')
      throw new Error('Invalid page request.')
  if (typeof value.query === 'string' && value.query.length > 10000)
    throw new Error('Search query is too long.')
  return {
    database: value.database,
    store: value.store,
    cursor: value.cursor,
    query: value.query,
    limit: 100
  }
}
