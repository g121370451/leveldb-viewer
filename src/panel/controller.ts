import * as vscode from 'vscode'
import * as path from 'path'
import { DatabaseClient } from './client'
import { panelHtml } from './html'
import { dispatch } from './requests'
import { errorMessage } from '../core/operation'

const clients = new Set<DatabaseClient>()

export function openDatabasePanel(context: vscode.ExtensionContext, source: string): void {
  new ViewerPanel(context.extensionUri, source)
}

export async function disposePanels(): Promise<void> {
  const results = await Promise.allSettled([...clients].map((client) => client.dispose()))
  clients.clear()
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  )
  if (failures.length)
    throw new Error(failures.map((result) => errorMessage(result.reason)).join('\n'))
}

class ViewerPanel {
  private readonly panel: vscode.WebviewPanel
  private readonly client: DatabaseClient
  private readonly subscription: vscode.Disposable
  private busy = false
  private disposed = false

  constructor(
    extension: vscode.Uri,
    private readonly source: string
  ) {
    const config = vscode.workspace.getConfiguration('leveldbViewer')
    this.client = new DatabaseClient(
      source,
      config.get<number>('maxSnapshotGB', 10) * 1024 ** 3,
      config.get<number>('maxValueMB', 32) * 1024 ** 2,
      config.get<number>('maxCacheGB', 20) * 1024 ** 3
    )
    clients.add(this.client)
    this.panel = vscode.window.createWebviewPanel(
      'leveldbViewer',
      `LevelDB: ${path.basename(source)}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extension, 'media')]
      }
    )
    this.subscription = this.panel.webview.onDidReceiveMessage((message) => this.receive(message))
    this.panel.onDidDispose(() => this.dispose())
    this.panel.webview.html = panelHtml(this.panel.webview, extension)
  }

  private async receive(message: any): Promise<void> {
    if (!message || typeof message.type !== 'string') return
    if (message.type === 'cancel') {
      this.client.cancel()
      return
    }
    if (
      this.busy ||
      !['ready', 'refresh', 'page', 'filter', 'detail', 'attachment'].includes(message.type)
    )
      return
    this.busy = true
    this.send({ type: 'busy', busy: true })
    try {
      const response = await dispatch(this.client, this.source, message, (message) =>
        this.send({ type: 'progress', message })
      )
      if (response) this.send(response)
    } catch (error) {
      this.send({ type: 'error', message: errorMessage(error) })
    } finally {
      this.busy = false
      this.send({ type: 'busy', busy: false })
    }
  }

  private send(message: object): void {
    if (!this.disposed) void this.panel.webview.postMessage(message)
  }

  private dispose(): void {
    this.disposed = true
    this.subscription.dispose()
    void this.client
      .dispose()
      .catch((error) =>
        vscode.window.showWarningMessage(`Viewer cleanup failed: ${errorMessage(error)}`)
      )
      .finally(() => clients.delete(this.client))
  }
}
