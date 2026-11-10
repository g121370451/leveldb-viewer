const { test } = require('node:test')
const assert = require('node:assert/strict')
const v8 = require('node:v8')
const snappy = require('snappyjs')
const { ValueDecoder } = require('../out/indexeddb/v8/decoder')
const { decodeValue } = require('../out/indexeddb/value')
const { recordIdentity } = require('../out/indexeddb/keys')
const { envelope, varint } = require('./fixtures.cjs')

function serialize(value) {
  const writer = new v8.Serializer()
  writer.writeHeader()
  writer.writeValue(value)
  return writer.releaseBuffer()
}
test('V8 decoder preserves objects, special types, shared identity and cycles', () => {
  const buffer = new ArrayBuffer(24)
  new Uint8Array(buffer).set([1, 2, 3])
  const value = {
    title: '测试 🎉',
    latin: 'café',
    number: -513,
    float: Infinity,
    negativeZero: -0,
    bigint: 123456789012345678901234567890n,
    date: new Date('2026-01-01'),
    map: new Map([['nested', { x: true }]]),
    set: new Set([1, 'two']),
    regexp: /hello/gi,
    undef: undefined,
    nil: null,
    array: [1, , undefined, 'x'],
    buffer,
    bytes: new Uint8Array(buffer, 1, 2),
    ints: new Int32Array(buffer, 4, 2),
    booleanObject: Object(false),
    stringObject: Object('hi'),
    numberObject: Object(23)
  }
  value.self = value
  value.shared = value.map
  const decoded = new ValueDecoder(serialize(value), []).decode()
  assert.deepEqual(decoded, value)
  assert.equal(decoded.self, decoded)
  assert.equal(decoded.shared, decoded.map)
  assert.equal(decoded.bytes.buffer, decoded.buffer)
})
test('wire version 16 is decoded independently of Node version', () => {
  // A standalone v16 wire fixture, including a UTF-8 key and value.
  const payload = Buffer.from([
    255,
    16,
    111,
    34,
    5,
    ...Buffer.from('title'),
    34,
    4,
    ...Buffer.from('task'),
    123,
    1
  ])
  assert.deepEqual(new ValueDecoder(payload, []).decode(), { title: 'task' })
  assert.throws(() => new ValueDecoder(Buffer.from([255, 99, 48]), []).decode(), /version 99/)
})
test('Blink envelopes: uncompressed, Snappy, external value and Blob reference', async () => {
  const serialized = serialize({ hello: 'world' })
  const record = envelope(serialized)
  assert.deepEqual(
    await decodeValue(
      record,
      [],
      async () => {
        throw Error('unexpected')
      },
      1024
    ),
    { hello: 'world' }
  )
  const compressed = Buffer.concat([
    Buffer.from([1, 255, 17, 2]),
    Buffer.from(snappy.compress(record.subarray(1)))
  ])
  assert.deepEqual(await decodeValue(compressed, [], async () => {}, 1024), { hello: 'world' })
  const external = Buffer.concat([
    Buffer.from([1, 255, 17, 1]),
    varint(record.length - 1),
    Buffer.from([0])
  ])
  assert.deepEqual(await decodeValue(external, [], async () => record.subarray(1), 1024), {
    hello: 'world'
  })
  const blob = { type: 'Blob', number: '5', mime: 'text/plain', size: 8 }
  assert.deepEqual(
    await decodeValue(envelope(Buffer.from([255, 16, 92, 105, 0])), [blob], async () => {}, 1024),
    blob
  )
  await assert.rejects(
    decodeValue(compressed, [], async () => {}, 8),
    /limit/
  )
})
test('different prefix widths and signed zero have the same IDB key identity', () => {
  const zero = Buffer.alloc(8),
    negative = Buffer.alloc(8)
  negative.writeDoubleLE(-0)
  const a = Buffer.concat([Buffer.from([0, 1, 1, 1, 3]), zero])
  const b = Buffer.concat([Buffer.from([32, 1, 0, 1, 1, 3]), negative])
  assert.deepEqual(recordIdentity(a), recordIdentity(b))
})
test('hostile __proto__ is an own property, and invalid references fail', () => {
  const source = Object.create(null)
  Object.defineProperty(source, '__proto__', { value: { polluted: true }, enumerable: true })
  const decoded = new ValueDecoder(serialize(source), []).decode()
  assert.equal(Object.prototype.polluted, undefined)
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype)
  assert.equal(Object.hasOwn(decoded, '__proto__'), true)
  assert.throws(() => new ValueDecoder(Buffer.from([255, 16, 94, 123]), []).decode(), /reference/)
})
