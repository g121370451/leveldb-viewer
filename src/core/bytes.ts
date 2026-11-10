export class Bytes {
  offset = 0
  constructor(readonly data: Buffer) {}
  get remaining(): number {
    return this.data.length - this.offset
  }
  take(length: number): Buffer {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining)
      throw new Error('Truncated or oversized binary field.')
    const value = this.data.subarray(this.offset, this.offset + length)
    this.offset += length
    return value
  }
  byte(): number {
    return this.take(1)[0]
  }
  varBig(): bigint {
    let value = 0n
    for (let shift = 0n; shift < 70n; shift += 7n) {
      const byte = this.byte()
      value |= BigInt(byte & 127) << shift
      if (!(byte & 128)) return value
    }
    throw new Error('Invalid variable-length integer.')
  }
  varInt(): number {
    const value = this.varBig()
    if (value > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error('Integer exceeds the supported range.')
    return Number(value)
  }
  slice(): Buffer {
    return this.take(this.varInt())
  }
  utf16(): string {
    return utf16be(this.take(this.varInt() * 2))
  }
}

export function utf16be(value: Buffer): string {
  if (value.length % 2) throw new Error('Invalid UTF-16 field length.')
  return Buffer.from(value).swap16().toString('utf16le')
}

export function littleInteger(value: Buffer): bigint {
  let result = 0n
  for (let i = value.length - 1; i >= 0; i--) result = (result << 8n) | BigInt(value[i])
  return result
}

export function textOrHex(value: Buffer): string {
  const text = value.toString('utf8')
  return Buffer.from(text).equals(value) && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)
    ? text
    : `0x${value.toString('hex')}`
}
