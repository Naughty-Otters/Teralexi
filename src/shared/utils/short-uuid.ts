/** Default compact id length (hex chars). */
export const DEFAULT_SHORT_UUID_LENGTH = 12

/**
 * Compact UUID-like identifier using cryptographically strong random bytes when available.
 * Falls back to Math.random only if Web Crypto is unavailable.
 */
export function randomShortUuid(length = DEFAULT_SHORT_UUID_LENGTH): string {
  const size = Math.max(1, Math.floor(length))
  const bytes = new Uint8Array(Math.ceil(size / 2))

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }

  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, size)
}
