# 1.1.0

- Preserve the published extension identity (`g121370451.leveldb-viewer`) so updates do not register duplicate commands.

- Read Chromium / WebView2 IndexedDB, including structure, keys and serialized objects.
- Add incremental physical snapshots, worker-based indexing, paging and cancellable search.
- Preserve binary keys, reveal error causes, enforce cache limits and clean up viewer sessions.
- Split extension, panel, storage, decoding and frontend responsibilities; add integration and UI tests.

# Changelog

## 0.1.0

- Initial LevelDB viewer for VS Code.
- Supports manual database opening, Electron AppData detection, workspace database path configuration, search, table view, tree view, JSON formatting, and refresh.
