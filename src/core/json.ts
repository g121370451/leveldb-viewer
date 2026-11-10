// Format JSON without parsing and reserializing numbers. IDs larger than
// Number.MAX_SAFE_INTEGER must remain exactly as stored.
export function formatJson(text: string): string {
  try {
    JSON.parse(text)
  } catch {
    return text
  }
  let output = '',
    depth = 0,
    quoted = false,
    escaped = false
  const line = () => {
    output += '\n' + '  '.repeat(depth)
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      output += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (/\s/.test(char)) continue
    if (char === '"') {
      quoted = true
      output += char
    } else if (char === '{' || char === '[') {
      output += char
      depth++
      if (depth > 100) return text
      line()
    } else if (char === '}' || char === ']') {
      depth--
      line()
      output += char
    } else if (char === ',') {
      output += char
      line()
    } else if (char === ':') output += ': '
    else output += char
  }
  return output
}
