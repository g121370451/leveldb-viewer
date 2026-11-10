'use strict'
window.ViewerRender = (() => {
  const el = (tag, text, className) => {
    const node = document.createElement(tag)
    if (text !== undefined) node.textContent = text
    if (className) node.className = className
    return node
  }
  const button = (text, action) => {
    const node = el('button', text)
    node.addEventListener('click', action)
    return node
  }
  function catalog(summary, selection, select) {
    const root = document.getElementById('catalog')
    root.replaceChildren(
      button(`All raw records (${summary.count})`, () => select({}, 'All raw records'))
    )
    for (const db of summary.databases) {
      root.append(
        el('h3', db.name),
        el('div', `Version ${db.version || '?'} · ${db.origin || ''}`, 'muted')
      )
      for (const store of db.stores) {
        const item = button(`${store.name} (${store.count})`, () =>
          select({ database: db.id, store: store.id }, store.name, store)
        )
        item.classList.toggle(
          'selected',
          selection.database === db.id && selection.store === store.id
        )
        root.append(item)
      }
    }
  }
  function list(entries, tree, selected, select) {
    const root = document.getElementById('list')
    root.replaceChildren()
    if (!entries.length) {
      root.append(el('p', 'No matching records.', 'empty'))
      return
    }
    if (tree) {
      renderTree(root, entries, selected, select)
      return
    }
    const table = el('table'),
      head = el('tr')
    head.append(el('th', 'Key'), el('th', 'Value / preview'))
    const thead = el('thead')
    thead.append(head)
    table.append(thead)
    const body = el('tbody')
    for (const entry of entries) {
      const row = el('tr')
      row.classList.toggle('selected', entry.id === selected)
      const key = el('td')
      key.append(button(entry.key || '(empty key)', () => select(entry.id)))
      row.append(key, el('td', entry.preview))
      body.append(row)
    }
    table.append(body)
    root.append(table)
  }
  function renderTree(root, entries, selected, select) {
    const groups = new Map()
    for (const entry of entries) {
      const parts = entry.key.split('!').filter(Boolean)
      let parent = root,
        prefix = ''
      for (const part of parts.slice(0, -1)) {
        prefix += `/${encodeURIComponent(part)}`
        if (!groups.has(prefix)) {
          const group = el('details')
          group.open = true
          group.append(el('summary', part))
          parent.append(group)
          groups.set(prefix, group)
        }
        parent = groups.get(prefix)
      }
      const leaf = button(parts.at(-1) || '(empty key)', () => select(entry.id))
      leaf.className = 'tree-leaf'
      leaf.classList.toggle('selected', entry.id === selected)
      parent.append(leaf)
    }
  }
  function detail(data, hex, attachment) {
    document.getElementById('detailKey').textContent = data?.key || 'Select a record'
    document.getElementById('warning').textContent = data?.warning || ''
    const value = document.getElementById('value')
    value.textContent = !data
      ? ''
      : hex
        ? `Key (hex, first 64 KiB):\n${data.keyHex}\n\nValue (hex, first 64 KiB of ${data.bytes} bytes):\n${data.valueHex}`
        : data.value ||
          (data.warning ? 'Switch to Raw bytes to inspect this value.' : '(empty value)')
    if (data && !hex) highlight(value)
    const files = document.getElementById('attachments')
    files.replaceChildren()
    for (const [index, object] of (data?.external || []).entries()) {
      files.append(
        button(
          `Preview ${object.type}: ${object.name || object.mime || index} (${object.size ?? '?'} bytes)`,
          () => attachment(index)
        )
      )
    }
    if (data?.external.length)
      files.append(
        el(
          'p',
          'Attachments are read on demand from the source and may have changed since this snapshot.',
          'muted'
        )
      )
  }
  function highlight(node) {
    const text = node.textContent
    // Tokens become text nodes; database strings are never interpreted as HTML.
    const tokens =
      /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:true|false|null|undefined)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?n?)/g
    const fragment = document.createDocumentFragment()
    let position = 0
    for (const match of text.matchAll(tokens)) {
      fragment.append(document.createTextNode(text.slice(position, match.index)))
      const quoted = match[0][0] === '"' || match[0][0] === "'"
      const kind = quoted
        ? 'string'
        : /^(true|false|null|undefined)$/.test(match[0])
          ? 'literal'
          : 'number'
      fragment.append(el('span', match[0], `token-${kind}`))
      position = match.index + match[0].length
    }
    fragment.append(document.createTextNode(text.slice(position)))
    node.replaceChildren(fragment)
  }
  return { catalog, list, detail }
})()
