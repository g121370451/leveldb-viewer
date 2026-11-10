import type { ValueDecoder } from './decoder'

export function readProperties(decoder: ValueDecoder, object: object, end: string): void {
  let count = 0
  while (decoder.peek() !== end) {
    const key = decoder.read()
    if (typeof key !== 'string' && typeof key !== 'number')
      throw new Error('Invalid object property key.')
    Object.defineProperty(object, key, {
      value: decoder.read(),
      enumerable: true,
      writable: true,
      configurable: true
    })
    count++
  }
  decoder.tag()
  if (decoder.reader.varInt() !== count) throw new Error('Object property count mismatch.')
}
export function readArray(decoder: ValueDecoder, dense: boolean): unknown[] {
  const length = decoder.reader.varInt()
  if (length > 10_000_000 || (dense && length > decoder.reader.remaining))
    throw new Error('Serialized array exceeds decoding limits.')
  const array = decoder.remember(new Array(length))
  if (dense)
    for (let index = 0; index < length; index++) {
      if (decoder.peek() === '-') decoder.tag()
      else array[index] = decoder.read()
    }
  readProperties(decoder, array, dense ? '$' : '@')
  if (decoder.reader.varInt() !== length) throw new Error('Array length mismatch.')
  return array
}
export function readMap(decoder: ValueDecoder): Map<unknown, unknown> {
  const result = decoder.remember(new Map<unknown, unknown>())
  let count = 0
  while (decoder.peek() !== ':') {
    result.set(decoder.read(), decoder.read())
    count += 2
  }
  decoder.tag()
  if (decoder.reader.varInt() !== count) throw new Error('Map entry count mismatch.')
  return result
}
export function readSet(decoder: ValueDecoder): Set<unknown> {
  const result = decoder.remember(new Set<unknown>())
  let count = 0
  while (decoder.peek() !== ',') {
    result.add(decoder.read())
    count++
  }
  decoder.tag()
  if (decoder.reader.varInt() !== count) throw new Error('Set entry count mismatch.')
  return result
}
