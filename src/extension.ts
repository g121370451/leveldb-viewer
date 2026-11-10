import * as vscode from 'vscode'
import { registerCommands } from './commands'
import { refreshDetectedDatabaseStatus } from './discovery'
import { disposePanels } from './panel/controller'

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  const detected = { path: '' }
  status.command = 'leveldbViewer.openDetectedDatabase'
  status.text = '$(database) LevelDB'
  const refresh = () => refreshDetectedDatabaseStatus(status, detected)
  registerCommands(context, () => detected.path, refresh)
  context.subscriptions.push(
    status,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refresh()
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('leveldbViewer.databasePath')) void refresh()
    })
  )
  void refresh()
}

export function deactivate(): Promise<void> {
  return disposePanels()
}
