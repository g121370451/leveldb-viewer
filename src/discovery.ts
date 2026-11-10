import * as path from 'path'
import * as vscode from 'vscode'
import { isLevelDBDirectory } from './leveldbReader'

interface ElectronProject {
  folder: vscode.WorkspaceFolder
  packageName: string
}

interface DetectedDatabase {
  dbPath: string
  label: string
  source: 'configured' | 'electron'
}

export async function refreshDetectedDatabaseStatus(
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
    if (
      path.isAbsolute(configuredDatabasePath) &&
      (await isLevelDBDirectory(configuredDatabasePath))
    ) {
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

    if (
      packageJson &&
      isElectronPackage(packageJson) &&
      typeof packageJson.name === 'string' &&
      packageJson.name.trim()
    ) {
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

async function readWorkspacePackageJson(
  folder: vscode.WorkspaceFolder
): Promise<Record<string, unknown> | null> {
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
  return (
    hasDependency(packageJson.dependencies, 'electron') ||
    hasDependency(packageJson.devDependencies, 'electron')
  )
}

function hasDependency(dependencies: unknown, dependencyName: string): boolean {
  return (
    isObjectRecord(dependencies) &&
    Object.prototype.hasOwnProperty.call(dependencies, dependencyName)
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getLeafName(value: string): string {
  return path.basename(value)
}
