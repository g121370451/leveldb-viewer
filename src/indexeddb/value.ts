import { Deserializer } from 'v8'
import { inspect } from 'util'
import { uncompress } from 'snappyjs'
import { Bytes } from '../core/bytes'
import { ExternalObject } from './external'
import { ValueDecoder } from './v8/decoder'

class BlinkDeserializer extends Deserializer {
  constructor(
    data: Buffer,
    private readonly objects: ExternalObject[]
  ) {
    super(data)
  }
  _readHostObject(): unknown {
    const tag = this.readRawBytes(1).toString()
    if (tag === 'i' || tag === 'e') return this.external(this.readUint32())
    if (tag === 'L') {
      const count = this.readUint32()
      if (count > this.objects.length) throw new Error('Invalid FileList length.')
      return {
        type: 'FileList',
        files: Array.from({ length: count }, () => this.external(this.readUint32()))
      }
    }
    throw new Error(
      `Unsupported Blink object tag ${JSON.stringify(tag)}. Raw bytes remain available.`
    )
  }
  private external(index: number): ExternalObject {
    if (!this.objects[index]) throw new Error(`Missing external object metadata ${index}.`)
    return this.objects[index]
  }
}

export async function decodeValue(
  data: Buffer,
  objects: ExternalObject[],
  load: (index: number) => Promise<Buffer>,
  maxBytes: number
): Promise<unknown> {
  const reader = new Bytes(data)
  reader.varBig() // IndexedDB record version, not a JavaScript value.
  return decodeEnvelope(reader.take(reader.remaining), objects, load, maxBytes, 0)
}

async function decodeEnvelope(
  data: Buffer,
  objects: ExternalObject[],
  load: (index: number) => Promise<Buffer>,
  maxBytes: number,
  depth: number
): Promise<unknown> {
  if (depth > 4 || data.length > maxBytes)
    throw new Error('Serialized object exceeds decoding limits.')
  const reader = new Bytes(data)
  if (reader.byte() !== 255) throw new Error('Missing Blink serialization header.')
  const version = reader.varInt()
  if (version === 17) {
    const wrapper = reader.byte()
    if (wrapper === 1) {
      const length = reader.varInt(),
        index = reader.varInt()
      if (length > maxBytes)
        throw new Error('External serialized value exceeds the decoding limit.')
      const external = await load(index)
      if (external.length !== length) throw new Error('External serialized value length mismatch.')
      return decodeEnvelope(external, objects, load, maxBytes, depth + 1)
    }
    if (wrapper === 2)
      return decodeEnvelope(
        Buffer.from(uncompress(reader.take(reader.remaining), maxBytes)),
        objects,
        load,
        maxBytes,
        depth + 1
      )
    throw new Error(`Unsupported IndexedDB value wrapper ${wrapper}.`)
  }
  let end = data.length
  if (version >= 21) {
    if (reader.byte() !== 254) throw new Error('Missing Blink trailer header.')
    const offset = reader.take(8).readBigUInt64BE(),
      length = reader.take(4).readUInt32BE()
    if (offset) {
      if (offset > BigInt(data.length) || offset + BigInt(length) > BigInt(data.length))
        throw new Error('Invalid Blink trailer range.')
      end = Number(offset)
    }
  }
  // Before Blink 16 the header also served as the V8 header.
  const payload = version < 16 ? data : data.subarray(reader.offset, end)
  const header = new Bytes(payload)
  if (header.byte() === 255 && header.varInt() >= 13)
    return new ValueDecoder(payload, objects).decode()
  const decoder = new BlinkDeserializer(payload, objects)
  decoder.readHeader()
  return decoder.readValue()
}

export function displayValue(value: unknown, full = false): string {
  // inspect preserves BigInt, Date, Map, Set, typed arrays and cyclic references.
  return inspect(value, {
    depth: full ? null : 30,
    maxArrayLength: full ? null : 2000,
    maxStringLength: full ? null : 200000,
    colors: false,
    compact: false,
    getters: false,
    customInspect: false
  })
}
