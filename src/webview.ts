import * as vscode from 'vscode'
import type { LevelDBEntry } from './leveldbReader'

export function renderLevelDBWebview(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  dbPath: string,
  entries: LevelDBEntry[]
): string {
  const nonce = getNonce()
  const payload = JSON.stringify({ dbPath, entries }).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LevelDB Viewer</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --border: var(--vscode-panel-border);
      --bg: var(--vscode-editor-background);
      --muted: var(--vscode-descriptionForeground);
      --text: var(--vscode-editor-foreground);
      --accent: var(--vscode-focusBorder);
      --row-hover: var(--vscode-list-hoverBackground);
      --row-selected: var(--vscode-list-activeSelectionBackground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --button-bg: var(--vscode-button-secondaryBackground);
      --button-fg: var(--vscode-button-secondaryForeground);
      --button-hover: var(--vscode-button-secondaryHoverBackground);
      --code-font: var(--vscode-editor-font-family, Consolas, monospace);
      --tree-indent: 20px;
      --tree-guide: rgba(128, 128, 128, 0.28);
      --tree-depth-0: #005fb8;
      --tree-depth-1: #00735a;
      --tree-depth-2: #9b4f96;
      --tree-depth-3: #986f00;
      --tree-depth-4: #b14c00;
      --tree-depth-5: #5f6b00;
      --tree-depth-6: #0078a8;
      --tree-depth-7: #a43155;
      --tree-depth-bg-0: rgba(0, 95, 184, 0.08);
      --tree-depth-bg-1: rgba(0, 115, 90, 0.08);
      --tree-depth-bg-2: rgba(155, 79, 150, 0.08);
      --tree-depth-bg-3: rgba(152, 111, 0, 0.08);
      --tree-depth-bg-4: rgba(177, 76, 0, 0.08);
      --tree-depth-bg-5: rgba(95, 107, 0, 0.08);
      --tree-depth-bg-6: rgba(0, 120, 168, 0.08);
      --tree-depth-bg-7: rgba(164, 49, 85, 0.08);
      --json-key: #0451a5;
      --json-string: #a31515;
      --json-number: #098658;
      --json-boolean: #0000ff;
      --json-null: #795e26;
    }

    body.vscode-dark,
    body.vscode-high-contrast {
      --tree-guide: rgba(180, 180, 180, 0.28);
      --tree-depth-0: #569cd6;
      --tree-depth-1: #4ec9b0;
      --tree-depth-2: #c586c0;
      --tree-depth-3: #dcdcaa;
      --tree-depth-4: #ce9178;
      --tree-depth-5: #b5cea8;
      --tree-depth-6: #9cdcfe;
      --tree-depth-7: #f48771;
      --tree-depth-bg-0: rgba(86, 156, 214, 0.11);
      --tree-depth-bg-1: rgba(78, 201, 176, 0.1);
      --tree-depth-bg-2: rgba(197, 134, 192, 0.11);
      --tree-depth-bg-3: rgba(220, 220, 170, 0.1);
      --tree-depth-bg-4: rgba(206, 145, 120, 0.11);
      --tree-depth-bg-5: rgba(181, 206, 168, 0.1);
      --tree-depth-bg-6: rgba(156, 220, 254, 0.1);
      --tree-depth-bg-7: rgba(244, 135, 113, 0.11);
      --json-key: #9cdcfe;
      --json-string: #ce9178;
      --json-number: #b5cea8;
      --json-boolean: #569cd6;
      --json-null: #dcdcaa;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      overflow: hidden;
    }

    .app {
      display: grid;
      grid-template-rows: auto auto auto 1fr;
      height: 100vh;
      min-width: 0;
    }

    .toolbar,
    .filterbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      min-width: 0;
    }

    .toolbar {
      justify-content: space-between;
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .path {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
      font-size: 12px;
      font-family: var(--code-font);
    }

    .summary,
    .status {
      white-space: nowrap;
      color: var(--muted);
      font-size: 12px;
    }

    .status {
      display: none;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      background: var(--vscode-inputValidation-infoBackground, transparent);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status.visible {
      display: block;
    }

    .status.error {
      color: var(--vscode-inputValidation-errorForeground, var(--text));
      background: var(--vscode-inputValidation-errorBackground, transparent);
    }

    .filterbar input {
      width: 100%;
      min-width: 0;
      height: 28px;
      padding: 4px 8px;
      color: var(--input-fg);
      background: var(--input-bg);
      border: 1px solid var(--vscode-input-border, transparent);
      outline: none;
    }

    .filterbar input:focus {
      border-color: var(--accent);
    }

    button {
      height: 28px;
      padding: 0 10px;
      border: 1px solid transparent;
      color: var(--button-fg);
      background: var(--button-bg);
      cursor: pointer;
      white-space: nowrap;
    }

    button:hover {
      background: var(--button-hover);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    button.active {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    .content {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) minmax(300px, 42%);
      min-height: 0;
      min-width: 0;
    }

    .list,
    .detail {
      min-height: 0;
      overflow: auto;
    }

    .list {
      border-right: 1px solid var(--border);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    th,
    td {
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      color: var(--muted);
      background: var(--bg);
      font-size: 12px;
      font-weight: 600;
    }

    tr {
      cursor: pointer;
    }

    tr:hover,
    .tree-row:hover {
      background: var(--row-hover);
    }

    tr.selected,
    .tree-row.selected {
      background: var(--row-selected);
    }

    .key,
    .value,
    .tree-row,
    pre {
      font-family: var(--code-font);
      font-size: 12px;
    }

    .key {
      width: 34%;
      word-break: break-all;
      color: var(--vscode-symbolIcon-stringForeground, var(--text));
    }

    .value {
      width: 66%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
    }

    .tree-row {
      --depth-color: var(--tree-depth-0);
      --depth-bg: var(--tree-depth-bg-0);
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 4px 10px 4px calc(10px + var(--depth, 0) * var(--tree-indent));
      border-bottom: 1px solid var(--border);
      background-image: linear-gradient(90deg, var(--depth-bg), transparent 170px);
      box-shadow: inset 3px 0 0 var(--depth-color);
      cursor: pointer;
      position: relative;
      user-select: none;
    }

    .tree-row::before {
      content: "";
      position: absolute;
      left: calc(10px + var(--depth, 0) * var(--tree-indent) - 7px);
      top: 5px;
      bottom: 5px;
      width: 3px;
      border-radius: 2px;
      background: var(--depth-color);
      pointer-events: none;
      opacity: 0.95;
    }

    .tree-row::after {
      content: "";
      position: absolute;
      left: calc(10px + var(--depth, 0) * var(--tree-indent) - 4px);
      top: 50%;
      width: 9px;
      border-top: 1px solid var(--depth-color);
      pointer-events: none;
      opacity: 0.8;
    }

    .tree-row.root::after {
      display: none;
    }

    .tree-row.depth-0 {
      --depth-color: var(--tree-depth-0);
      --depth-bg: var(--tree-depth-bg-0);
    }

    .tree-row.depth-1 {
      --depth-color: var(--tree-depth-1);
      --depth-bg: var(--tree-depth-bg-1);
    }

    .tree-row.depth-2 {
      --depth-color: var(--tree-depth-2);
      --depth-bg: var(--tree-depth-bg-2);
    }

    .tree-row.depth-3 {
      --depth-color: var(--tree-depth-3);
      --depth-bg: var(--tree-depth-bg-3);
    }

    .tree-row.depth-4 {
      --depth-color: var(--tree-depth-4);
      --depth-bg: var(--tree-depth-bg-4);
    }

    .tree-row.depth-5 {
      --depth-color: var(--tree-depth-5);
      --depth-bg: var(--tree-depth-bg-5);
    }

    .tree-row.depth-6 {
      --depth-color: var(--tree-depth-6);
      --depth-bg: var(--tree-depth-bg-6);
    }

    .tree-row.depth-7 {
      --depth-color: var(--tree-depth-7);
      --depth-bg: var(--tree-depth-bg-7);
    }

    .tree-row:hover {
      background-image: linear-gradient(90deg, var(--depth-bg), transparent 170px);
    }

    .tree-row.selected {
      background-image: linear-gradient(90deg, var(--depth-bg), transparent 170px);
    }

    .twisty {
      width: 12px;
      color: var(--muted);
      text-align: center;
      flex-shrink: 0;
    }

    .twisty.open {
      transform: rotate(90deg);
    }

    .tree-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tree-row.branch > .tree-label {
      color: var(--depth-color);
      font-weight: 600;
    }

    .tree-row.branch > .tree-count {
      color: var(--depth-color);
      opacity: 0.9;
    }

    .tree-row.leaf > .twisty {
      color: var(--depth-color);
    }

    .tree-depth {
      flex: 0 0 calc(var(--depth, 0) * var(--tree-indent));
      height: 1px;
    }

    .tree-count,
    .tree-preview {
      color: var(--muted);
      font-size: 11px;
    }

    .tree-preview {
      margin-left: auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 45%;
    }

    .detail {
      display: grid;
      grid-template-rows: auto 1fr;
      min-width: 0;
    }

    .detail-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      min-width: 0;
    }

    .detail-key {
      overflow-wrap: anywhere;
      font-family: var(--code-font);
      font-size: 12px;
      color: var(--vscode-symbolIcon-stringForeground, var(--text));
    }

    .value-type {
      padding: 2px 6px;
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 11px;
      line-height: 16px;
      text-transform: uppercase;
    }

    pre {
      margin: 0;
      padding: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .json-key {
      color: var(--json-key);
      font-weight: 600;
    }

    .json-string {
      color: var(--json-string);
    }

    .json-number {
      color: var(--json-number);
    }

    .json-boolean {
      color: var(--json-boolean);
      font-weight: 600;
    }

    .json-null {
      color: var(--json-null);
      font-style: italic;
    }

    .empty {
      padding: 28px 16px;
      color: var(--muted);
      text-align: center;
    }

    @media (max-width: 780px) {
      .content {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(220px, 1fr) minmax(180px, 38%);
      }

      .list {
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="toolbar">
      <div class="path" id="dbPath" title=""></div>
      <div class="toolbar-actions">
        <div class="summary" id="summary"></div>
        <button id="refresh" title="Refresh database snapshot">Refresh</button>
      </div>
    </header>
    <section class="filterbar">
      <input id="search" placeholder="Search key or value" autofocus>
      <button id="tableMode" class="active" title="Table view">Table</button>
      <button id="treeMode" title="Tree view split by !">Tree</button>
    </section>
    <div class="status" id="status"></div>
    <main class="content">
      <section class="list" id="list"></section>
      <section class="detail" id="detail"></section>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initialState = ${payload};
    const state = {
      entries: normalizeEntries(initialState.entries),
      dbPath: initialState.dbPath,
      query: '',
      mode: 'table',
      selectedKey: initialState.entries[0]?.key ?? '',
      expanded: new Set(),
      loading: false,
      error: ''
    };

    const els = {
      dbPath: document.getElementById('dbPath'),
      summary: document.getElementById('summary'),
      search: document.getElementById('search'),
      tableMode: document.getElementById('tableMode'),
      treeMode: document.getElementById('treeMode'),
      refresh: document.getElementById('refresh'),
      status: document.getElementById('status'),
      list: document.getElementById('list'),
      detail: document.getElementById('detail')
    };

    els.dbPath.textContent = state.dbPath;
    els.dbPath.title = state.dbPath;

    els.search.addEventListener('input', () => {
      state.query = els.search.value.trim().toLowerCase();
      render();
    });

    els.tableMode.addEventListener('click', () => {
      state.mode = 'table';
      render();
    });

    els.treeMode.addEventListener('click', () => {
      state.mode = 'tree';
      render();
    });

    els.refresh.addEventListener('click', () => {
      if (state.loading) return;
      state.loading = true;
      state.error = '';
      renderStatus();
      vscode.postMessage({ type: 'refresh' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;

      if (message.type === 'refreshStarted') {
        state.loading = true;
        state.error = '';
        renderStatus();
        return;
      }

      if (message.type === 'entriesUpdated') {
        const previousSelection = state.selectedKey;
        state.entries = normalizeEntries(message.entries);
        state.loading = false;
        state.error = '';
        state.selectedKey = state.entries.some((entry) => entry.key === previousSelection)
          ? previousSelection
          : state.entries[0]?.key ?? '';
        render();
        return;
      }

      if (message.type === 'refreshError') {
        state.loading = false;
        state.error = message.message || 'Refresh failed.';
        renderStatus();
      }
    });

    function filteredEntries() {
      if (!state.query) return state.entries;
      return state.entries.filter((entry) => {
        return normalizeText(entry.key).toLowerCase().includes(state.query) || normalizeText(entry.value).toLowerCase().includes(state.query);
      });
    }

    function render() {
      const entries = filteredEntries();
      els.summary.textContent = entries.length + ' / ' + state.entries.length + ' entries';
      els.tableMode.classList.toggle('active', state.mode === 'table');
      els.treeMode.classList.toggle('active', state.mode === 'tree');
      renderStatus();

      if (!entries.length) {
        els.list.innerHTML = '<div class="empty">No matching entries.</div>';
        renderDetail(null);
        return;
      }

      if (!entries.some((entry) => entry.key === state.selectedKey)) {
        state.selectedKey = entries[0].key;
      }

      if (state.mode === 'tree') {
        renderTree(entries);
      } else {
        renderTable(entries);
      }

      renderDetail(entries.find((entry) => entry.key === state.selectedKey) ?? entries[0]);
    }

    function renderStatus() {
      els.refresh.disabled = state.loading;

      if (state.loading) {
        els.status.textContent = 'Refreshing database snapshot...';
        els.status.className = 'status visible';
        return;
      }

      if (state.error) {
        els.status.textContent = state.error;
        els.status.className = 'status visible error';
        return;
      }

      els.status.textContent = '';
      els.status.className = 'status';
    }

    function renderTable(entries) {
      const rows = entries.map((entry) => {
        const selected = entry.key === state.selectedKey ? ' class="selected"' : '';
        return '<tr data-key="' + escapeAttr(entry.key) + '"' + selected + '>' +
          '<td class="key">' + escapeHtml(entry.key) + '</td>' +
          '<td class="value">' + escapeHtml(previewValue(entry.value, 180)) + '</td>' +
          '</tr>';
      }).join('');

      els.list.innerHTML = '<table><thead><tr><th class="key">Key</th><th class="value">Value</th></tr></thead><tbody>' + rows + '</tbody></table>';
      els.list.querySelectorAll('tr[data-key]').forEach((row) => {
        row.addEventListener('click', () => {
          state.selectedKey = row.getAttribute('data-key');
          render();
        });
      });
    }

    function renderTree(entries) {
      const nodes = flattenTree(buildTree(entries), 0);
      els.list.innerHTML = nodes.map((node) => {
        const isSelected = node.entry?.key === state.selectedKey;
        const marker = node.hasChildren
          ? '<span class="twisty ' + (state.expanded.has(node.id) ? 'open' : '') + '">&#9656;</span>'
          : '<span class="twisty">&bull;</span>';
        const count = node.hasChildren ? '<span class="tree-count">(' + node.entryCount + ')</span>' : '';
        const preview = node.entry ? '<span class="tree-preview">' + escapeHtml(previewValue(node.entry.value, 80)) + '</span>' : '';
        const classes = [
          'tree-row',
          'depth-' + (node.depth % 8),
          node.depth === 0 ? 'root' : '',
          node.hasChildren ? 'branch' : 'leaf',
          isSelected ? 'selected' : ''
        ].filter(Boolean).join(' ');
        return '<div class="' + classes + '" data-id="' + escapeAttr(node.id) + '" data-key="' + escapeAttr(node.entry?.key ?? '') + '" data-has-children="' + node.hasChildren + '" data-has-value="' + Boolean(node.entry) + '" style="--depth:' + node.depth + '">' +
          marker + '<span class="tree-label">' + escapeHtml(node.label) + '</span>' + count + preview +
          '</div>';
      }).join('');

      els.list.querySelectorAll('.tree-row').forEach((row) => {
        row.addEventListener('click', () => {
          const hasChildren = row.getAttribute('data-has-children') === 'true';
          const hasValue = row.getAttribute('data-has-value') === 'true';
          const id = row.getAttribute('data-id');

          if (hasValue) {
            state.selectedKey = row.getAttribute('data-key');
          }

          if (hasChildren) {
            if (state.expanded.has(id)) {
              state.expanded.delete(id);
            } else {
              state.expanded.add(id);
            }
          }

          render();
        });
      });
    }

    function renderDetail(entry) {
      if (!entry) {
        els.detail.innerHTML = '<div class="empty">Select an entry to inspect its value.</div>';
        return;
      }

      const value = renderValue(entry.value);
      els.detail.innerHTML = '<div class="detail-head"><div class="detail-key">' + escapeHtml(entry.key) + '</div><span class="value-type">' + value.type + '</span></div>' + value.html;
    }

    function buildTree(entries) {
      const root = [];

      for (const entry of entries) {
        const parts = entry.key.split('!').filter((part) => part.length > 0);
        const visibleParts = parts.length ? parts : ['(empty key)'];
        let current = root;
        const idParts = [];

        visibleParts.forEach((part, index) => {
          idParts.push(encodePathPart(part));
          const id = idParts.join('!');
          let node = current.find((candidate) => candidate.id === id);

          if (!node) {
            node = { id, label: part, children: [], entry: null };
            current.push(node);
          }

          if (index === visibleParts.length - 1) {
            if (node.entry && node.entry.key !== entry.key) {
              node.children.push({
                id: id + '!duplicate-' + encodePathPart(entry.key),
                label: entry.key || '(empty key)',
                children: [],
                entry
              });
            } else {
              node.entry = entry;
            }
          }

          current = node.children;
        });
      }

      return root;
    }

    function flattenTree(nodes, depth) {
      const result = [];

      for (const node of nodes) {
        const hasChildren = node.children.length > 0;
        result.push({
          id: node.id,
          label: node.label,
          depth,
          hasChildren,
          entry: node.entry,
          entryCount: countEntries(node)
        });

        if (hasChildren && state.expanded.has(node.id)) {
          result.push(...flattenTree(node.children, depth + 1));
        }
      }

      return result;
    }

    function countEntries(node) {
      return (node.entry ? 1 : 0) + node.children.reduce((total, child) => total + countEntries(child), 0);
    }

    function renderValue(value) {
      const text = normalizeText(value);
      const parsed = parseJson(value);

      if (!parsed.ok) {
        return {
          type: 'Text',
          html: '<pre>' + escapeHtml(text) + '</pre>'
        };
      }

      const formatted = JSON.stringify(parsed.value, null, 2);
      return {
        type: 'JSON',
        html: '<pre class="json">' + highlightJson(formatted) + '</pre>'
      };
    }

    function parseJson(value) {
      try {
        return { ok: true, value: JSON.parse(normalizeText(value)) };
      } catch {
        return { ok: false, value: null };
      }
    }

    function highlightJson(json) {
      let result = '';
      let index = 0;

      while (index < json.length) {
        const char = json[index];

        if (char === '"') {
          let end = index + 1;
          let escaped = false;

          while (end < json.length) {
            const current = json[end];

            if (current === '\\\\' && !escaped) {
              escaped = true;
              end += 1;
              continue;
            }

            if (current === '"' && !escaped) {
              end += 1;
              break;
            }

            escaped = false;
            end += 1;
          }

          const token = json.slice(index, end);
          const nextIndex = nextNonWhitespaceIndex(json, end);
          const className = json[nextIndex] === ':' ? 'json-key' : 'json-string';
          result += '<span class="' + className + '">' + escapeHtml(token) + '</span>';
          index = end;
          continue;
        }

        const numberMatch = json.slice(index).match(/^-?[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
        if (numberMatch) {
          result += '<span class="json-number">' + numberMatch[0] + '</span>';
          index += numberMatch[0].length;
          continue;
        }

        if (json.startsWith('true', index) || json.startsWith('false', index)) {
          const token = json.startsWith('true', index) ? 'true' : 'false';
          result += '<span class="json-boolean">' + token + '</span>';
          index += token.length;
          continue;
        }

        if (json.startsWith('null', index)) {
          result += '<span class="json-null">null</span>';
          index += 4;
          continue;
        }

        result += escapeHtml(char);
        index += 1;
      }

      return result;
    }

    function nextNonWhitespaceIndex(text, start) {
      let index = start;

      while (index < text.length) {
        const char = text[index];
        if (char !== ' ' && char !== '\\n' && char !== '\\r' && char !== '\\t') {
          break;
        }
        index += 1;
      }

      return index;
    }

    function previewValue(value, maxLength) {
      const formatted = formatValue(value).replace(/\\s+/g, ' ');
      return formatted.length > maxLength ? formatted.slice(0, maxLength) + '...' : formatted;
    }

    function formatValue(value) {
      const parsed = parseJson(value);
      return parsed.ok ? JSON.stringify(parsed.value, null, 2) : value;
    }

    function encodePathPart(value) {
      return encodeURIComponent(value);
    }

    function normalizeEntries(entries) {
      if (!Array.isArray(entries)) return [];
      return entries.map((entry) => ({
        key: normalizeText(entry?.key),
        value: normalizeText(entry?.value)
      }));
    }

    function normalizeText(value) {
      if (value === null || value === undefined) return '';
      return typeof value === 'string' ? value : String(value);
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    render();
  </script>
</body>
</html>`
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let nonce = ''

  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return nonce
}
