const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { ClassicLevel } = require('classic-level')
const { DatabaseSession } = require('../out/database/session')
const { fixture, log } = require('./fixtures.cjs')
const { logRecords } = require('../out/storage/log')

async function hashes(directory) {
  const result = {}
  for (const name of await fs.readdir(directory))
    result[name] = crypto
      .createHash('sha256')
      .update(await fs.readFile(path.join(directory, name)))
      .digest('hex')
  return result
}
test('real compressed tables + WAL: deletions, binary identity, pagination and refresh reuse', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'leveldb-viewer-source-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const db = new ClassicLevel(directory, {
    keyEncoding: 'buffer',
    valueEncoding: 'buffer',
    writeBufferSize: 65536
  })
  await db.open()
  await db.batch(
    Array.from({ length: 1500 }, (_, i) => ({
      type: 'put',
      key: Buffer.from(`key${String(i).padStart(5, '0')}`),
      value: Buffer.from('compressible-'.repeat(100))
    }))
  )
  await db.compactRange(Buffer.alloc(0), Buffer.from([255]))
  await db.del(Buffer.from('key00002'))
  await db.put(Buffer.from('key00001'), Buffer.from('new value'))
  await db.put(Buffer.from([128]), Buffer.from('binary A'))
  await db.put(Buffer.from([129]), Buffer.from('binary B'))
  const expected = new Map()
  for await (const [key, value] of db.iterator())
    expected.set(key.toString('hex'), value.toString('hex'))
  await db.close()
  assert.ok((await fs.readdir(directory)).some((name) => name.endsWith('.ldb')))
  const before = await hashes(directory)
  const session = new DatabaseSession(directory)
  t.after(() => session.dispose())
  const summary = await session.refresh()
  assert.equal(summary.count, expected.size)
  const actual = new Map()
  let cursor
  do {
    const page = await session.page({ cursor, limit: 137 })
    for (const entry of page.entries) {
      const detail = await session.detail(entry.id)
      actual.set(detail.keyHex, detail.valueHex)
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  assert.deepEqual(actual, expected)
  const search = await session.page({ query: 'new value' })
  assert.equal(search.entries.length, 1)
  const refreshed = await session.refresh()
  assert.ok(refreshed.reusedBytes > 0)
  assert.ok(refreshed.copiedBytes < summary.copiedBytes)
  assert.deepEqual(await hashes(directory), before, 'viewer must not modify source files')
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(session.refresh({ signal: abort.signal }), /cancelled/)
  assert.equal(
    (await session.page({ query: 'new value' })).entries.length,
    1,
    'cancel keeps prior snapshot'
  )
  await fs.writeFile(path.join(directory, 'CURRENT'), 'invalid\n')
  await assert.rejects(session.refresh(), /CURRENT/)
  assert.equal(
    (await session.page({ query: 'new value' })).entries.length,
    1,
    'failed refresh keeps prior snapshot'
  )
})

test('unknown comparator and incomplete directory fail explicitly', async (t) => {
  const directory = await fixture(t, 'unknown.comparator')
  const session = new DatabaseSession(directory)
  t.after(() => session.dispose())
  await assert.rejects(session.refresh(), /Unsupported comparator/)
  await fs.unlink(path.join(directory, 'CURRENT'))
  await assert.rejects(session.refresh(), /ENOENT/)
})

test('fragmented logs are reconstructed; checksum corruption is rejected', async (t) => {
  const directory = await fixture(t)
  const filename = path.join(directory, 'large.log')
  const expected = [Buffer.alloc(90000, 17), Buffer.from('tail')]
  const content = log(expected)
  await fs.writeFile(filename, content)
  const actual = []
  for await (const record of logRecords(filename)) actual.push(record)
  assert.deepEqual(actual, expected)
  content[12] ^= 1
  await fs.writeFile(filename, content)
  await assert.rejects(async () => {
    for await (const record of logRecords(filename)) void record
  }, /Checksum/)
})
