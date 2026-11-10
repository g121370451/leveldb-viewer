declare module 'snappyjs' {
  export function uncompress(value: Uint8Array, maxLength?: number): Uint8Array
  export function compress(value: Uint8Array): Uint8Array
}
