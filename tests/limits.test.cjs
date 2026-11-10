const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { DatabaseSession } = require('../out/database/session')
const { readExternal } = require('../out/indexeddb/external')
const { formatJson } = require('../out/core/json')
const { fixture, envelope, field, varint } = require('./fixtures.cjs')

test('source and cache limits reject early; large values stay inspectable as bytes', async (t) => {
  const source = await fixture(t, 'leveldb.BytewiseComparator', [
    { key: Buffer.from('key'), value: Buffer.alloc(100, 65) }
  ])
  const smallSource = new DatabaseSession(source, 10)
  t.after(() => smallSource.dispose())
  await assert.rejects(smallSource.refresh(), /snapshot limit/)
  const smallCache = new DatabaseSession(source, 10000, 1000, 10)
  t.after(() => smallCache.dispose())
  await assert.rejects(smallCache.refresh(), /cache budget/)
  const smallValue = new DatabaseSession(source, 10000, 10)
  t.after(() => smallValue.dispose())
  await smallValue.refresh()
  const page = await smallValue.page()
  const detail = await smallValue.detail(page.entries[0].id)
  assert.match(detail.warning, /exceeds/)
  assert.equal(detail.valueHex.length, 200)
  const search = await smallValue.page({ query: 'AAA' })
  assert.equal(search.undecodable, 1)
})

test('pending IndexedDB transaction scope fails explicitly, global scope metadata is allowed', async (t) => {
  const root = await fixture(t, 'idb_cmp1', [
    { key: Buffer.from([0, 0, 0, 0, 50, 1, 1]), value: Buffer.from([8, 1]) }
  ])
  const session = new DatabaseSession(root)
  t.after(() => session.dispose())
  await assert.rejects(session.refresh(), /scope recovery/)
})

test('external Blob metadata and on-demand attachment preview', async (t) => {
  const key = Buffer.from([0, 1, 1, 1, 1, 1, 0, 97])
  const externalKey = Buffer.from(key)
  externalKey[3] = 3
  const mime = Buffer.from('text/plain', 'utf16le').swap16()
  const metadata = Buffer.concat([Buffer.from([0, 5]), varint(10), mime, varint(5)])
  const parent = await fixture(t, 'idb_cmp1', [
    { key, value: envelope(Buffer.from([255, 16, 92, 105, 0])) },
    { key: externalKey, value: metadata }
  ])
  const source = path.join(parent, 'file__0.indexeddb.leveldb')
  await fs.mkdir(source)
  for (const file of ['CURRENT', 'MANIFEST-000001', '000003.log'])
    await fs.rename(path.join(parent, file), path.join(source, file))
  const blobPath = path.join(parent, 'file__0.indexeddb.blob', '1', '00')
  await fs.mkdir(blobPath, { recursive: true })
  await fs.writeFile(path.join(blobPath, '5'), 'hello')
  const session = new DatabaseSession(source)
  t.after(() => session.dispose())
  await session.refresh()
  const page = await session.page({ database: '1', store: '1' })
  const detail = await session.detail(page.entries[0].id)
  assert.equal(detail.warning, undefined)
  assert.equal(detail.external[0].mime, 'text/plain')
  assert.equal((await session.attachment(detail.id, 0)).text, 'hello')
  await fs.unlink(path.join(blobPath, '5'))
  await assert.rejects(session.attachment(detail.id, 0), /ENOENT/)
})

test('JSON formatting preserves numeric literals and hostile strings verbatim', () => {
  const text = '{"id":90071992547409931234,"html":"</script>","escape":"a\\\"b"}'
  const result = formatJson(text)
  assert.match(result, /90071992547409931234/)
  assert.match(result, /<\/script>/)
  assert.equal(result.replace(/\s/g, ''), text)
})
