import * as vscode from 'vscode'
import { randomBytes } from 'crypto'

export function panelHtml(webview: vscode.Webview, extension: vscode.Uri): string {
  const resource = (name: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extension, 'media', name))
  const nonce = randomBytes(18).toString('base64')
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${resource('viewer.css')}"><title>LevelDB Viewer</title></head>
<body>
<header><div><strong id="title">LevelDB Viewer</strong><div id="path" class="muted"></div></div><div class="actions"><button id="refresh">Refresh</button><button id="cancel" disabled>Cancel</button></div></header>
<div id="status" role="status">Opening database…</div>
<div id="snapshot" class="muted"></div>
<main><aside><h2>Database structure</h2><nav id="catalog"></nav><pre id="schema"></pre></aside>
<section class="records"><form id="searchForm"><input id="query" aria-label="Search" placeholder="Search keys and values"><select id="scope" aria-label="Search scope"><option value="page">Current page</option><option value="all">Entire selection</option></select><button>Search</button><button type="button" id="clear">Clear</button></form>
<div class="listbar"><span id="count"></span><button id="tree">Tree: off</button></div>
<div id="list" tabindex="0"></div><footer><button id="previous" disabled>Previous</button><span id="pageNumber"></span><button id="next" disabled>Next</button></footer></section>
<section class="detail"><div class="detailbar"><strong id="detailKey">Select a record</strong><select id="view" aria-label="Value view"><option value="decoded">Decoded / text</option><option value="hex">Raw bytes</option></select></div><div id="warning"></div><pre id="value"></pre><div id="attachments"></div></section></main>
<script nonce="${nonce}" src="${resource('render.js')}"></script>
<script nonce="${nonce}" src="${resource('viewer.js')}"></script></body></html>`
}
