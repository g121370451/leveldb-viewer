# LevelDB Viewer

VS Code extension for browsing LevelDB databases.

[中文文档](https://github.com/g121370451/leveldb-viewer/blob/master/README-CN.md)

## Demo

### Open a LevelDB database

![Open a LevelDB database](resources/opendatabase.gif)

### Configure a workspace database path

![Configure database path](resources/config_path.gif)

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
