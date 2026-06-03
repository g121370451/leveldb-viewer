import * as path from 'path'
import * as vscode from 'vscode'
import { isLevelDBDirectory, LevelDBReader } from './leveldbReader'
import { renderLevelDBWebview } from './webview'

interface ElectronProject {
  folder: vscode.WorkspaceFolder
  packageName: string
}

interface DetectedDatabase {
  dbPath: string
  label: string
  source: 'configured' | 'electron'
}

export function activate(context: vscode.ExtensionContext): void {
  const reader = new LevelDBReader()
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  const detectedDatabase = { path: '' }

  statusBarItem.command = 'leveldbViewer.openDetectedDatabase'
  statusBarItem.text = '$(database) LevelDB'
  statusBarItem.tooltip = 'Open detected LevelDB database'

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand('leveldbViewer.openDatabase', async () => {
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Open LevelDB',
        title: 'Select LevelDB Database Folder'
      })

      if (!selection?.length) {
        return
      }

      await openDatabasePanel(context, reader, selection[0].fsPath)
    }),
    vscode.commands.registerCommand('leveldbViewer.openDetectedDatabase', async () => {
      if (!detectedDatabase.path) {
        await refreshDetectedDatabaseStatus(statusBarItem, detectedDatabase)
      }

      if (!detectedDatabase.path) {
        void vscode.window.showInformationMessage(
          'No LevelDB database found. Set leveldbViewer.databasePath for this workspace, or open an Electron project with %APPDATA%/<package.json name>/db.'
        )
        return
      }

      await openDatabasePanel(context, reader, detectedDatabase.path)
    }),
    vscode.commands.registerCommand('leveldbViewer.configureDatabasePath', async () => {
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Use as LevelDB Path',
        title: 'Select LevelDB Database Folder for This Workspace'
      })

      if (!selection?.length) {
        return
      }

      const dbPath = selection[0].fsPath
      if (!(await isLevelDBDirectory(dbPath))) {
        void vscode.window.showWarningMessage('The selected folder does not look like a LevelDB database.')
        return
      }

      await vscode.workspace
        .getConfiguration('leveldbViewer')
        .update('databasePath', dbPath, vscode.ConfigurationTarget.Workspace)
      await refreshDetectedDatabaseStatus(statusBarItem, detectedDatabase)
      void vscode.window.showInformationMessage(`LevelDB database path saved for this workspace: ${dbPath}`)
    }),
    vscode.commands.registerCommand('leveldbViewer.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openWorkspaceSettings', 'leveldbViewer.databasePath')
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refreshDetectedDatabaseStatus(statusBarItem, detectedDatabase)
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('leveldbViewer.databasePath')) {
        void refreshDetectedDatabaseStatus(statusBarItem, detectedDatabase)
      }
    })
  )

  void refreshDetectedDatabaseStatus(statusBarItem, detectedDatabase)
}

export function deactivate(): void {
  // No persistent resources are kept open between commands.
}

async function refreshDetectedDatabaseStatus(
  statusBarItem: vscode.StatusBarItem,
  detectedDatabase: { path: string }
): Promise<void> {
  const detected = await findAppDataDatabasePath()
  detectedDatabase.path = detected?.dbPath ?? ''

  if (!detected) {
    statusBarItem.hide()
    return
  }

  statusBarItem.text = `$(database) LevelDB: ${detected.label}`
  statusBarItem.tooltip = `Open ${detected.source === 'configured' ? 'configured' : 'detected Electron'} LevelDB database: ${detected.dbPath}`
  statusBarItem.show()
}

async function findAppDataDatabasePath(): Promise<DetectedDatabase | null> {
  const configuredDatabasePath = getConfiguredDatabasePath()
  if (configuredDatabasePath) {
    if (path.isAbsolute(configuredDatabasePath) && (await isLevelDBDirectory(configuredDatabasePath))) {
      return {
        dbPath: configuredDatabasePath,
        label: getLeafName(configuredDatabasePath),
        source: 'configured'
      }
    }

    return null
  }

  const appDataPath = process.env.APPDATA
  const projects = await getElectronProjects()

  if (!appDataPath || !projects.length) {
    return null
  }

  for (const project of projects) {
    const dbPath = path.join(appDataPath, project.packageName, 'db')
    if (await isLevelDBDirectory(dbPath)) {
      return {
        dbPath,
        label: project.packageName,
        source: 'electron'
      }
    }
  }

  return null
}

async function getElectronProjects(): Promise<ElectronProject[]> {
  const folders = vscode.workspace.workspaceFolders ?? []
  const projects: ElectronProject[] = []

  for (const folder of folders) {
    const packageJson = await readWorkspacePackageJson(folder)

    if (packageJson && isElectronPackage(packageJson) && typeof packageJson.name === 'string' && packageJson.name.trim()) {
      projects.push({
        folder,
        packageName: packageJson.name.trim()
      })
    }
  }

  return projects
}

function getConfiguredDatabasePath(): string {
  return vscode.workspace.getConfiguration('leveldbViewer').get<string>('databasePath', '').trim()
}

async function readWorkspacePackageJson(folder: vscode.WorkspaceFolder): Promise<Record<string, unknown> | null> {
  const packageJsonUri = vscode.Uri.joinPath(folder.uri, 'package.json')

  try {
    const content = await vscode.workspace.fs.readFile(packageJsonUri)
    const parsed = JSON.parse(Buffer.from(content).toString('utf8')) as unknown
    return isObjectRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isElectronPackage(packageJson: Record<string, unknown>): boolean {
  return hasDependency(packageJson.dependencies, 'electron') || hasDependency(packageJson.devDependencies, 'electron')
}

function hasDependency(dependencies: unknown, dependencyName: string): boolean {
  return isObjectRecord(dependencies) && Object.prototype.hasOwnProperty.call(dependencies, dependencyName)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function openDatabasePanel(
  context: vscode.ExtensionContext,
  reader: LevelDBReader,
  dbPath: string
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'leveldbViewer',
    `LevelDB: ${getLeafName(path.dirname(dbPath))}/${getLeafName(dbPath)}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [context.extensionUri]
    }
  )

  panel.webview.html = renderLoadingWebview(dbPath)
  let refreshInFlight = false

  const messageDisposable = panel.webview.onDidReceiveMessage(
    async (message: { type?: string }) => {
      if (message.type !== 'refresh') {
        return
      }

      if (refreshInFlight) {
        return
      }

      refreshInFlight = true
      await panel.webview.postMessage({ type: 'refreshStarted' })

      try {
        const entries = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Refreshing LevelDB database',
            cancellable: false
          },
          () => reader.readDatabase(dbPath)
        )

        await panel.webview.postMessage({ type: 'entriesUpdated', entries })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await panel.webview.postMessage({ type: 'refreshError', message })
        void vscode.window.showErrorMessage(`Failed to refresh LevelDB database: ${message}`)
      } finally {
        refreshInFlight = false
      }
    },
    undefined
  )
  panel.onDidDispose(() => messageDisposable.dispose())

  try {
    const entries = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Reading LevelDB database',
        cancellable: false
      },
      () => reader.readDatabase(dbPath)
    )

    panel.webview.html = renderLevelDBWebview(panel.webview, context.extensionUri, dbPath, entries)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    panel.webview.html = renderErrorWebview(dbPath, message)
    void vscode.window.showErrorMessage(`Failed to read LevelDB database: ${message}`)
  }
}

function getLeafName(filePath: string): string {
  const normalized = filePath.replace(/[\\/]$/, '')
  const parts = normalized.split(/[\\/]/)
  return parts[parts.length - 1] || normalized
}

function renderLoadingWebview(dbPath: string): string {
  return renderSimpleWebview('Reading LevelDB database...', dbPath)
}

function renderErrorWebview(dbPath: string, message: string): string {
  return renderSimpleWebview('Could not read LevelDB database', `${dbPath}\n\n${message}`)
}

function renderSimpleWebview(title: string, body: string): string {
  const escapedTitle = escapeHtml(title)
  const escapedBody = escapeHtml(body)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 24px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
    }

    h1 {
      margin: 0 0 12px;
      font-size: 18px;
      font-weight: 600;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family, Consolas, monospace);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>${escapedTitle}</h1>
  <pre>${escapedBody}</pre>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
