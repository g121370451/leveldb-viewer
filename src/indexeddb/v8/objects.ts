import type { ValueDecoder } from './decoder'

export function readRegExp(decoder: ValueDecoder): RegExp {
  const pattern = decoder.read(),
    flags = decoder.reader.varInt()
  if (typeof pattern !== 'string' || flags & ~0x1bf)
    throw new Error('Unsupported regular expression flags.')
  return decoder.remember(
    new RegExp(
      pattern,
      ['g', 'i', 'm', 'y', 'u', 's', '', 'd', 'v'].filter((_, i) => flags & (1 << i)).join('')
    )
  )
}
export function readBuffer(decoder: ValueDecoder, resizable: boolean): ArrayBuffer {
  const length = decoder.reader.varInt()
  if (resizable) {
    const max = decoder.reader.varInt()
    if (max < length) throw new Error('Invalid resizable buffer size.')
  }
  const value = Uint8Array.from(decoder.reader.take(length)).buffer
  return decoder.remember(value)
}
export function readHost(decoder: ValueDecoder): unknown {
  const tag = decoder.tag()
  const read = () => {
    const index = decoder.reader.varInt()
    if (!decoder.external[index]) throw new Error(`Missing external object metadata ${index}.`)
    return { ...decoder.external[index] }
  }
  if (tag === 'i' || tag === 'e') return decoder.remember(read())
  if (tag === 'L') {
    const count = decoder.reader.varInt()
    if (count > decoder.external.length) throw new Error('Invalid FileList length.')
    return decoder.remember({ type: 'FileList', files: Array.from({ length: count }, read) })
  }
  throw new Error(`Unsupported Blink object tag ${JSON.stringify(tag)}.`)
}
export function readError(decoder: ValueDecoder): Error {
  const value = decoder.remember(new Error())
  const names: Record<string, string> = {
    E: 'EvalError',
    R: 'RangeError',
    F: 'ReferenceError',
    S: 'SyntaxError',
    T: 'TypeError',
    U: 'URIError'
  }
  while (true) {
    const tag = decoder.tag()
    if (tag === '.') return value
    if (names[tag]) value.name = names[tag]
    else if (tag === 'm') value.message = String(decoder.read())
    else if (tag === 's') value.stack = String(decoder.read())
    else if (tag === 'c') value.cause = decoder.read()
    else throw new Error(`Unsupported Error field ${tag}.`)
  }
}
