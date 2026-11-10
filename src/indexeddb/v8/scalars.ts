import { Bytes, littleInteger } from '../../core/bytes'

export function bigint(reader: Bytes): bigint {
  const field = reader.varInt()
  const value = littleInteger(reader.take(Math.floor(field / 2)))
  return field & 1 ? -value : value
}
export function typedView(reader: Bytes, buffer: ArrayBuffer, version: number): unknown {
  const type = String.fromCharCode(reader.varInt()),
    offset = reader.varInt(),
    length = reader.varInt()
  const flags = version >= 14 ? reader.varInt() : 0
  if (flags & ~3) throw new Error('Unsupported typed array flags.')
  if (offset + length > buffer.byteLength) throw new Error('Typed array exceeds buffer bounds.')
  if (type === '?') return new DataView(buffer, offset, length)
  const constructors = {
    b: Int8Array,
    B: Uint8Array,
    C: Uint8ClampedArray,
    w: Int16Array,
    W: Uint16Array,
    d: Int32Array,
    D: Uint32Array,
    f: Float32Array,
    F: Float64Array,
    q: BigInt64Array,
    Q: BigUint64Array
  }
  const Type = constructors[type as keyof typeof constructors]
  if (!Type) throw new Error(`Unsupported typed array type ${type}.`)
  if (length % Type.BYTES_PER_ELEMENT) throw new Error('Invalid typed array byte length.')
  return new Type(buffer, offset, length / Type.BYTES_PER_ELEMENT)
}

export function readScalar(r: Bytes, tag: string): { value: unknown } | undefined {
  switch (tag) {
    case '_':
    case '-':
      return { value: undefined }
    case '0':
      return { value: null }
    case 'T':
      return { value: true }
    case 'F':
      return { value: false }
    case 'I': {
      const n = r.varInt()
      return { value: (n >>> 1) ^ -(n & 1) }
    }
    case 'U':
      return { value: r.varInt() }
    case 'N':
      return { value: r.take(8).readDoubleLE() }
    case 'Z':
      return { value: bigint(r) }
    case 'S':
      return { value: r.slice().toString('utf8') }
    case '"':
      return { value: r.slice().toString('latin1') }
    case 'c': {
      const data = r.slice()
      if (data.length % 2) throw new Error('Invalid UTF-16 string.')
      return { value: data.toString('utf16le') }
    }
    default:
      return undefined
  }
}
