const table = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0x82f63b78 : 0)
  return value >>> 0
})
export function maskedCrc(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8)
  crc = (crc ^ 0xffffffff) >>> 0
  return (((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0
}
