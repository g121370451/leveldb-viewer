const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { maskedCrc } = require('../out/storage/checksum')
function varint(number) {
  let n = BigInt(number)
  const result = []
  do {
    let byte = Number(n & 127n)
    n >>= 7n
    if (n) byte |= 128
    result.push(byte)
  } while (n)
  return Buffer.from(result)
}
function field(bytes) {
  return Buffer.concat([varint(bytes.length), bytes])
}
function log(records) {
  const chunks = []
  let offset = 0
  for (const record of records) {
    let position = 0,
      first = true
    do {
      const remaining = 32768 - offset
      if (remaining < 7) {
        chunks.push(Buffer.alloc(remaining))
        offset = 0
      }
      const count = Math.min(32768 - offset - 7, record.length - position)
      const last = position + count === record.length
      const type = first ? (last ? 1 : 2) : last ? 4 : 3
      const payload = record.subarray(position, position + count)
      const header = Buffer.alloc(7)
      header.writeUInt32LE(maskedCrc(Buffer.concat([Buffer.from([type]), payload])))
      header.writeUInt16LE(count, 4)
      header[6] = type
      chunks.push(header, payload)
      position += count
      offset += 7 + count
      first = false
      if (offset === 32768) offset = 0
    } while (position < record.length)
  }
  return Buffer.concat(chunks)
}
function batch(records, sequence = 1n) {
  const header = Buffer.alloc(12)
  header.writeBigUInt64LE(sequence)
  header.writeUInt32LE(records.length, 8)
  return Buffer.concat([
    header,
    ...records.flatMap(({ key, value }) => [
      Buffer.from([value === undefined ? 0 : 1]),
      field(key),
      ...(value === undefined ? [] : [field(value)])
    ])
  ])
}
async function fixture(t, comparator = 'idb_cmp1', records = []) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'leveldb-viewer-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  await fs.writeFile(path.join(directory, 'CURRENT'), 'MANIFEST-000001\n')
  await fs.writeFile(
    path.join(directory, 'MANIFEST-000001'),
    log([
      Buffer.concat([
        Buffer.from([1]),
        field(Buffer.from(comparator)),
        Buffer.from([2, 3, 3, 4, 4, 0])
      ])
    ])
  )
  await fs.writeFile(path.join(directory, '000003.log'), log([batch(records)]))
  return directory
}
function envelope(value) {
  return Buffer.concat([Buffer.from([1, 255, 21, 254]), Buffer.alloc(12), value])
}
module.exports = { varint, field, log, batch, fixture, envelope }
