# LevelDB Viewer

VS Code extension for browsing LevelDB databases.

<details>
<summary>中文说明</summary>

LevelDB Viewer 是一个用于在 VS Code 中浏览 LevelDB 数据库的扩展。

</details>

## Features

- Open a LevelDB database folder manually.
- Detect Electron project databases under `%APPDATA%/<package.json name>/db`.
- Configure a workspace-specific absolute database path.
- Browse entries in table or tree mode.
- Search keys and values.
- Format and highlight JSON values.
- Refresh the current database snapshot.

## Usage

Run `LevelDB Viewer: Open Database` from the command palette and select a LevelDB directory.

The extension copies the database into a temporary snapshot before reading, excluding the `LOCK` file. This makes it safer to inspect databases that may be locked by another process.

## AppData Quick Open

The status bar quick open first checks this workspace setting:

```json
{
  "leveldbViewer.databasePath": "C:\\Users\\you\\AppData\\Roaming\\my-electron-app\\db"
}
```

If `leveldbViewer.databasePath` is set, it must be an absolute path and must point to a LevelDB database directory.

When a workspace is open, the extension checks whether the workspace is an Electron project. The project is considered Electron-based when its `package.json` has `electron` in `dependencies` or `devDependencies`.

If no explicit database path is configured and an Electron project is detected, the extension reads the `package.json` `name` field and checks:

```text
%APPDATA%/<package.json name>/db
```

If that folder looks like a LevelDB database, a `LevelDB` button appears in the status bar.

## Settings

- `leveldbViewer.databasePath`: absolute LevelDB database path. This is useful in workspace settings so it only applies to the current project.

Project-only settings can be stored in:

```text
<project>/.vscode/settings.json
```

## Commands

- `LevelDB Viewer: Open Database`: manually select and open a LevelDB directory.
- `LevelDB Viewer: Open Detected AppData Database`: open the detected/configured database from the status bar logic.
- `LevelDB Viewer: Configure Database Path`: select a LevelDB directory and save it to the current workspace settings.
- `LevelDB Viewer: Open Settings`: open the VS Code Settings UI filtered to this extension.

<details>
<summary>完整中文说明</summary>

## 功能

- 手动打开 LevelDB 数据库目录。
- 自动检测 Electron 项目在 `%APPDATA%/<package.json name>/db` 下的数据库。
- 支持为当前工作区配置独立的数据库绝对路径。
- 支持表格视图和树状视图。
- 支持搜索 key 和 value。
- 自动格式化并高亮 JSON value。
- 支持刷新当前数据库快照。

## 使用方式

在命令面板中执行 `LevelDB Viewer: Open Database`，然后选择一个 LevelDB 数据库目录。

扩展读取数据库前会先复制一份临时快照，并跳过 `LOCK` 文件。这样在数据库可能被其他进程占用时，查看起来更安全。

## AppData 快捷打开

状态栏快捷入口会优先检查当前工作区配置：

```json
{
  "leveldbViewer.databasePath": "C:\\Users\\you\\AppData\\Roaming\\my-electron-app\\db"
}
```

如果配置了 `leveldbViewer.databasePath`，它必须是一个绝对路径，并且指向 LevelDB 数据库目录。

当打开一个工作区时，扩展会检查当前项目是否是 Electron 项目。如果 `package.json` 的 `dependencies` 或 `devDependencies` 中包含 `electron`，就会被认为是 Electron 项目。

如果没有显式配置数据库路径，并且检测到 Electron 项目，扩展会读取 `package.json` 的 `name` 字段，并检查：

```text
%APPDATA%/<package.json name>/db
```

如果该目录看起来像 LevelDB 数据库，VS Code 底部状态栏会出现 `LevelDB` 按钮，点击即可打开。

## 设置

- `leveldbViewer.databasePath`：LevelDB 数据库的绝对路径。建议写入工作区设置，这样只对当前项目生效。

项目级设置可以保存在：

```text
<project>/.vscode/settings.json
```

## 命令

- `LevelDB Viewer: Open Database`：手动选择并打开 LevelDB 数据库目录。
- `LevelDB Viewer: Open Detected AppData Database`：打开自动检测到或已配置的数据库。
- `LevelDB Viewer: Configure Database Path`：选择一个 LevelDB 目录，并保存到当前工作区设置。
- `LevelDB Viewer: Open Settings`：打开 VS Code 设置页面，并定位到本扩展相关设置。

</details>
