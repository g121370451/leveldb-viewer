const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DatabaseSession } = require('../out/database/session')
const { fixture, envelope, varint } = require('./fixtures.cjs')
const { Serializer } = require('node:v8')
function value(object) {
  const serializer = new Serializer()
  serializer.writeHeader()
  serializer.writeValue(object)
  return envelope(serializer.releaseBuffer())
}
function string(text) {
  return Buffer.from(text, 'utf16le').swap16()
}
function userKey(text, index = 1) {
  return Buffer.concat([Buffer.from([0, 1, 1, index, 1]), varint(text.length), string(text)])
}

test('IndexedDB catalog, object decoding, tombstones and pagination over 10,000 records', async (t) => {
  const records = [
    { key: Buffer.from([0, 1, 0, 0, 1]), value: string('Example') },
    { key: Buffer.from([0, 1, 0, 0, 4]), value: Buffer.from([2]) },
    { key: Buffer.from([0, 1, 0, 0, 50, 1, 0]), value: string('Tasks') },
    { key: Buffer.from([0, 1, 0, 0, 100, 1, 31, 0]), value: string('byTitle') },
    ...Array.from({ length: 10002 }, (_, i) => ({
      key: userKey(String(i).padStart(5, '0')),
      value: value({ title: `Task ${i}`, done: false })
    })),
    { key: userKey('00000'), value: undefined },
    { key: userKey('00001'), value: value({ title: 'updated', done: true }) }
  ]
  const source = await fixture(t, 'idb_cmp1', records)
  const session = new DatabaseSession(source)
  t.after(() => session.dispose())
  const summary = await session.refresh()
  assert.equal(summary.kind, 'indexeddb')
  assert.equal(summary.databases[0].name, 'Example')
  assert.equal(summary.databases[0].stores[0].count, 10001)
  assert.equal(summary.databases[0].stores[0].indexes[0].name, 'byTitle')
  const selection = { database: '1', store: '1' }
  const found = await session.page({ ...selection, query: 'updated' })
  assert.equal(found.entries.length, 1)
  assert.match((await session.detail(found.entries[0].id)).value, /done: true/)
  let count = 0,
    cursor
  do {
    const page = await session.page({ ...selection, cursor, limit: 200 })
    count += page.entries.length
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  assert.equal(count, 10001)
})
