'use strict'
;(() => {
  const vscode = acquireVsCodeApi(),
    render = window.ViewerRender
  const $ = (id) => document.getElementById(id)
  const state = {
    busy: false,
    summary: null,
    selection: {},
    entries: [],
    page: null,
    detail: null,
    tree: false,
    cursors: [undefined],
    pending: null,
    rollback: null,
    query: ''
  }
  const send = (message) => vscode.postMessage(message)
  const status = (text, error = false) => {
    $('status').textContent = text
    $('status').classList.toggle('error', error)
  }
  function request(message) {
    if (state.busy) return
    setBusy(true)
    send(message)
  }
  function setBusy(busy) {
    state.busy = busy
    document.querySelectorAll('button, input, select').forEach((node) => {
      node.disabled = busy
    })
    $('cancel').disabled = !busy
    $('previous').disabled = busy || state.cursors.length < 2
    $('next').disabled = busy || !state.page?.hasMore
  }
  function fetchPage() {
    request({
      type: 'page',
      request: { ...state.selection, cursor: state.cursors.at(-1), query: state.query }
    })
  }
  function showList() {
    const entries = state.entries
    render.list(entries, state.tree, state.detail?.id, (id) => request({ type: 'detail', id }))
    $('count').textContent =
      `${entries.length} shown on this page${state.query ? ' · search results' : ''}`
    $('pageNumber').textContent = `Page ${state.cursors.length}`
    setBusy(state.busy)
  }
  function select(selection, name, schema) {
    if (state.busy) return
    state.selection = selection
    state.cursors = [undefined]
    state.detail = null
    state.entries = []
    state.page = null
    showList()
    $('schema').textContent = schema
      ? JSON.stringify(schema, null, 2)
      : 'Raw records include internal metadata and indexes. Record order is the viewer’s stable byte order.'
    render.catalog(state.summary, selection, select)
    render.detail(null, false, () => {})
    fetchPage()
  }
  function showDetail() {
    render.detail(state.detail, $('view').value === 'hex', (index) =>
      request({ type: 'attachment', id: state.detail.id, index })
    )
  }
  function receive(message) {
    if (message.type === 'busy') {
      setBusy(message.busy)
      if (!message.busy && state.pending) {
        const next = state.pending
        state.pending = null
        next()
      }
    } else if (message.type === 'progress') status(message.message)
    else if (message.type === 'summary') acceptSummary(message)
    else if (message.type === 'page') {
      state.rollback = null
      state.page = message.page
      state.entries = message.page.entries
      state.detail = null
      showList()
      showDetail()
      status(
        `${message.page.scanned} records scanned${message.page.undecodable ? ` · ${message.page.undecodable} values could not be decoded; search may be incomplete` : ''}${message.page.hasMore ? ' · more results available' : ' · end of selection'}`
      )
    } else if (message.type === 'filtered') {
      state.entries = message.page.entries
      showList()
      status(
        `Searched ${message.page.scanned} records on this page${message.page.undecodable ? ` · ${message.page.undecodable} values could not be decoded` : ''}`
      )
    } else if (message.type === 'detail') {
      state.detail = message.detail
      showList()
      showDetail()
      status(
        `${message.detail.bytes} bytes · decoded view may abbreviate deep or large collections`
      )
    } else if (message.type === 'attachment') {
      $('value').textContent =
        `Attachment preview: first 64 KiB of ${message.attachment.bytes} bytes\n\n${message.attachment.text}`
      status('Attachment preview loaded from the source.')
    } else if (message.type === 'error') {
      if (state.rollback) {
        state.cursors = state.rollback
        state.rollback = null
      }
      status(
        `${message.message}${state.summary ? ' Your last successful snapshot remains available.' : ''}`,
        true
      )
    }
  }
  function acceptSummary(message) {
    state.summary = message.summary
    state.cursors = [undefined]
    state.detail = null
    $('path').textContent = message.source
    $('path').title = message.source
    $('title').textContent =
      message.summary.kind === 'indexeddb' ? 'IndexedDB Viewer' : 'LevelDB Viewer'
    $('snapshot').textContent =
      `Snapshot ${new Date(message.summary.capturedAt).toLocaleString()} · ${(message.summary.copiedBytes / 1048576).toFixed(1)} MiB copied · ${(message.summary.reusedBytes / 1048576).toFixed(1)} MiB reused · best effort copy of source files`
    if (message.summary.warnings?.length)
      $('snapshot').textContent += ` · ${message.summary.warnings.join(' · ')}`
    const db =
      message.summary.databases.find((db) => db.id === state.selection.database) ||
      message.summary.databases[0]
    const store = db?.stores.find((store) => store.id === state.selection.store) || db?.stores[0]
    state.pending = () =>
      select(store ? { database: db.id, store: store.id } : {}, store?.name || 'All records', store)
  }
  $('refresh').onclick = () => request({ type: 'refresh' })
  $('cancel').onclick = () => send({ type: 'cancel' })
  $('view').onchange = showDetail
  $('tree').onclick = () => {
    state.tree = !state.tree
    $('tree').textContent = `Tree: ${state.tree ? 'on (this page)' : 'off'}`
    showList()
  }
  $('next').onclick = () => {
    state.rollback = [...state.cursors]
    state.cursors.push(state.page.cursor)
    fetchPage()
  }
  $('previous').onclick = () => {
    state.rollback = [...state.cursors]
    state.cursors.pop()
    fetchPage()
  }
  $('searchForm').onsubmit = (event) => {
    event.preventDefault()
    if (state.busy) return
    if ($('scope').value === 'page')
      request({
        type: 'filter',
        ids: (state.page?.entries || []).map((entry) => entry.id),
        query: $('query').value.trim()
      })
    else {
      state.query = $('query').value.trim()
      state.cursors = [undefined]
      fetchPage()
    }
  }
  $('clear').onclick = () => {
    $('query').value = ''
    state.query = ''
    state.cursors = [undefined]
    fetchPage()
  }
  window.addEventListener('message', (event) => receive(event.data))
  request({ type: 'ready' })
})()
