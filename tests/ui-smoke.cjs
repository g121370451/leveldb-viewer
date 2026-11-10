const { chromium } = require('@playwright/test')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const Module = require('node:module')
const assert = require('node:assert/strict')
const { Serializer } = require('node:v8')
const { fixture, envelope, varint } = require('./fixtures.cjs')

async function main() {
  const cleanup = []
  const records = [
    { key: Buffer.from([0, 1, 0, 0, 1]), value: Buffer.from('Demo', 'utf16le').swap16() },
    { key: Buffer.from([0, 1, 0, 0, 50, 1, 0]), value: Buffer.from('Tasks', 'utf16le').swap16() }
  ]
  for (let i = 0; i < 205; i++) {
    const name = `task!${String(i).padStart(3, '0')}`
    const writer = new Serializer()
    writer.writeHeader()
    writer.writeValue({
      title: i === 150 ? 'Needle outside first page' : `Task ${i}`,
      done: false,
      count: 9007199254740993n
    })
    records.push({
      key: Buffer.concat([
        Buffer.from([0, 1, 1, 1, 1]),
        varint(name.length),
        Buffer.from(name, 'utf16le').swap16()
      ]),
      value: envelope(writer.releaseBuffer())
    })
  }
  const source = await fixture({ after: (fn) => cleanup.push(fn) }, 'idb_cmp1', records)
  let page, handler, disposed, panel
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html')
        res.end(panel.webview.html)
        return
      }
      const name = path.basename(req.url)
      if (!['viewer.css', 'viewer.js', 'render.js'].includes(name)) {
        res.writeHead(404).end()
        return
      }
      res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'application/javascript')
      res.end(await fs.readFile(path.join(__dirname, '..', 'media', name)))
    } catch (e) {
      res.writeHead(500).end(String(e))
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const stub = {
    Uri: { joinPath: (root, ...parts) => `${root}/${parts.join('/')}` },
    ViewColumn: { One: 1 },
    workspace: { getConfiguration: () => ({ get: (_, fallback) => fallback }) },
    window: {
      showWarningMessage: (message) => {
        throw Error(message)
      },
      createWebviewPanel: () => panel
    }
  }
  panel = {
    webview: {
      html: '',
      cspSource: origin,
      asWebviewUri: (uri) => uri,
      onDidReceiveMessage: (fn) => {
        handler = fn
        return { dispose() {} }
      },
      postMessage: async (message) => {
        await page.evaluate(
          (message) => window.dispatchEvent(new MessageEvent('message', { data: message })),
          message
        )
        return true
      }
    },
    onDidDispose: (fn) => {
      disposed = fn
    }
  }
  const originalLoad = Module._load
  Module._load = function (name, ...args) {
    return name === 'vscode' ? stub : originalLoad.call(this, name, ...args)
  }
  const { openDatabasePanel, disposePanels } = require('../out/panel/controller')
  Module._load = originalLoad
  let browser
  try {
    const channel = process.env.VIEWER_BROWSER || 'msedge'
    browser = await chromium.launch({
      ...(channel === 'chromium' ? {} : { channel }),
      headless: true
    })
    page = await browser.newPage({ viewport: { width: 1440, height: 940 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.exposeFunction('sendToExtension', (message) => handler(message))
    await page.addInitScript(() => {
      window.acquireVsCodeApi = () => ({
        postMessage: (message) => window.sendToExtension(message)
      })
      const theme = {
        'editor-background': '#181b20',
        'editor-foreground': '#d7dce5',
        'input-background': '#222832',
        'input-foreground': '#d7dce5',
        descriptionForeground: '#9faaba',
        'list-inactiveSelectionBackground': '#273950',
        'panel-border': '#343c48',
        'font-size': '13px',
        'font-family': 'Arial',
        errorForeground: '#ff8a8a'
      }
      document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.add('vscode-dark')
        for (const [key, value] of Object.entries(theme))
          document.documentElement.style.setProperty('--vscode-' + key, value)
      })
    })
    openDatabasePanel({ extensionUri: origin }, source)
    await page.goto(origin)
    await page.waitForFunction(
      () =>
        document.querySelectorAll('tbody tr').length === 100 &&
        !document.querySelector('#refresh').disabled
    )
    assert.match(await page.locator('#catalog').innerText(), /Tasks \(205\)/)
    await page.locator('tbody button').first().click()
    await page.waitForFunction(() =>
      document.querySelector('#value').textContent.includes('9007199254740993n')
    )
    await page.locator('#view').selectOption('hex')
    assert.match(await page.locator('#value').innerText(), /Value \(hex/)
    await page.locator('#view').selectOption('decoded')
    await page.locator('#next').click()
    await page.waitForFunction(
      () =>
        document.querySelector('#pageNumber').textContent === 'Page 2' &&
        !document.querySelector('#next').disabled
    )
    await page.locator('#query').fill('Needle')
    await page.locator('#scope').selectOption('all')
    await page.locator('#searchForm').getByRole('button', { name: 'Search', exact: true }).click()
    await page.waitForFunction(
      () =>
        document.querySelectorAll('tbody tr').length === 1 &&
        !document.querySelector('#refresh').disabled
    )
    await page.locator('tbody button').first().click()
    await page.waitForFunction(() =>
      document.querySelector('#value').textContent.includes('Needle outside first page')
    )
    await page.locator('#clear').click()
    await page.waitForFunction(
      () =>
        document.querySelectorAll('tbody tr').length === 100 &&
        !document.querySelector('#refresh').disabled
    )
    await page.locator('#tree').click()
    assert.ok(await page.locator('#list details').count())
    await page.locator('#tree').click()
    await page.locator('#refresh').click()
    await page.waitForFunction(
      () =>
        document.querySelectorAll('tbody tr').length === 100 &&
        !document.querySelector('#refresh').disabled
    )
    await page.locator('tbody button').first().click()
    await page.waitForFunction(() =>
      document.querySelector('#value').textContent.includes('Task 0')
    )
    await fs.mkdir(path.join(__dirname, '..', 'artifacts'), { recursive: true })
    await page.screenshot({
      path: path.join(__dirname, '..', 'artifacts', 'viewer-desktop.png'),
      fullPage: true
    })
    await page.setViewportSize({ width: 700, height: 950 })
    await page.screenshot({
      path: path.join(__dirname, '..', 'artifacts', 'viewer-narrow.png'),
      fullPage: true
    })
    assert.deepEqual(errors, [])
    console.log(
      'UI passed: catalog, paging, decoded detail, raw bytes, full search, tree, refresh, narrow layout.'
    )
  } finally {
    if (disposed) disposed()
    await disposePanels()
    if (browser) await browser.close()
    await new Promise((resolve) => server.close(resolve))
    for (const fn of cleanup) await fn()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
