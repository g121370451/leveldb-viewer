import { readProperties, readArray, readMap, readSet } from './collections'
import { readRegExp, readBuffer, readHost, readError } from './objects'
import { Bytes } from '../../core/bytes'
import { ExternalObject } from '../external'
import { bigint, typedView, readScalar } from './scalars'

// V8 wire versions are independent of the Node runtime. In particular v16
// uses 64-bit buffer lengths. Never rewrite the version byte to bypass checks.
export class ValueDecoder {
  readonly reader: Bytes
  private readonly references: unknown[] = []
  private version = 0
  private depth = 0
  constructor(
    data: Buffer,
    readonly external: ExternalObject[]
  ) {
    this.reader = new Bytes(data)
  }
  decode(): unknown {
    if (this.reader.byte() !== 255) throw new Error('Missing V8 header.')
    this.version = this.reader.varInt()
    if (this.version < 13 || this.version > 16)
      throw new Error(`Unsupported V8 serialization version ${this.version}.`)
    const result = this.read()
    while (this.reader.remaining && this.reader.data[this.reader.offset] === 0) this.reader.byte()
    if (this.reader.remaining) throw new Error('Unexpected bytes after serialized value.')
    return result
  }
  read(): unknown {
    if (++this.depth > 150) throw new Error('Serialized object nesting exceeds 150 levels.')
    try {
      let value = this.readTagged(this.tag())
      if (value instanceof ArrayBuffer && this.peek() === 'V') {
        this.tag()
        value = this.remember(typedView(this.reader, value, this.version))
      }
      return value
    } finally {
      this.depth--
    }
  }
  private readTagged(tag: string): unknown {
    const r = this.reader
    const scalar = readScalar(r, tag)
    if (scalar) return scalar.value
    switch (tag) {
      case '?':
        r.varInt()
        return this.read()
      case '^': {
        const id = r.varInt()
        if (id >= this.references.length) throw new Error('Invalid object reference.')
        return this.references[id]
      }
      case 'o': {
        const value = this.remember({})
        readProperties(this, value, '{')
        return value
      }
      case 'A':
      case 'a':
        return readArray(this, tag === 'A')
      case ';':
        return readMap(this)
      case "'":
        return readSet(this)
      case 'D':
        return this.remember(new Date(r.take(8).readDoubleLE()))
      case 'y':
      case 'x':
        return this.remember(Object(tag === 'y'))
      case 'n':
        return this.remember(Object(r.take(8).readDoubleLE()))
      case 'z':
        return this.remember(Object(bigint(r)))
      case 's':
        return this.remember(Object(this.read()))
      case 'R':
        return readRegExp(this)
      case 'B':
      case '~':
        return readBuffer(this, tag === '~')
      case '\\':
        return readHost(this)
      case 'r':
        return readError(this)
      default:
        throw new Error(`Unsupported V8 value tag ${JSON.stringify(tag)}.`)
    }
  }
  remember<T>(value: T): T {
    this.references.push(value)
    return value
  }
  peek(): string {
    let offset = this.reader.offset
    while (offset < this.reader.data.length && this.reader.data[offset] === 0) offset++
    return String.fromCharCode(this.reader.data[offset] ?? 0)
  }
  tag(): string {
    let tag = this.reader.byte()
    while (tag === 0) tag = this.reader.byte()
    return String.fromCharCode(tag)
  }
}
