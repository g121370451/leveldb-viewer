import * as vscode from 'vscode'
import { isLevelDBDirectory } from './leveldbReader'
import { openDatabasePanel } from './panel/controller'

export function registerCommands(
  context: vscode.ExtensionContext,
  detectedPath: () => string,
  refresh: () => Promise<void>
): void {
  const commands = {
    openDatabase: async () => {
      const selected = await selectDirectory('Select LevelDB Database Folder')
      if (selected) openDatabasePanel(context, selected)
    },
    openDetectedDatabase: async () => {
      await refresh()
      if (detectedPath()) openDatabasePanel(context, detectedPath())
      else
        void vscode.window.showInformationMessage(
          'No LevelDB database found. Configure leveldbViewer.databasePath or select a database manually.'
        )
    },
    configureDatabasePath: async () => {
      await configurePath()
      await refresh()
    },
    openSettings: () =>
      vscode.commands.executeCommand(
        'workbench.action.openWorkspaceSettings',
        'leveldbViewer.databasePath'
      )
  }
  for (const [name, handler] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(`leveldbViewer.${name}`, handler))
  }
}

async function selectDirectory(title: string): Promise<string | undefined> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select LevelDB',
    title
  })
  return selection?.[0].fsPath
}

async function configurePath(): Promise<void> {
  const selected = await selectDirectory('Select LevelDB Database Folder for This Workspace')
  if (!selected) return
  if (!(await isLevelDBDirectory(selected))) {
    void vscode.window.showWarningMessage(
      'Select a complete LevelDB directory containing CURRENT and its MANIFEST.'
    )
    return
  }
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global
  await vscode.workspace.getConfiguration('leveldbViewer').update('databasePath', selected, target)
  void vscode.window.showInformationMessage(`LevelDB database path saved: ${selected}`)
}
