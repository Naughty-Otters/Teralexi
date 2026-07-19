import { existsSync, statSync } from 'node:fs'

type CacheEntry<T> = {
  key: string
  value: T
}

/**
 * Tiny mtime-keyed memo for expensive instruction injectors.
 * Process-local; cleared implicitly when key changes.
 */
export function createMtimeKeyedCache<T>(): {
  getOrCompute: (keyParts: string[], compute: () => T) => T
  clear: () => void
} {
  let entry: CacheEntry<T> | null = null

  return {
    getOrCompute(keyParts, compute) {
      const key = keyParts.join('\0')
      if (entry && entry.key === key) return entry.value
      const value = compute()
      entry = { key, value }
      return value
    },
    clear() {
      entry = null
    },
  }
}

/** Stable fingerprint for a path's mtime (missing → `missing`). */
export function pathMtimeKey(filePath: string | null | undefined): string {
  const trimmed = filePath?.trim()
  if (!trimmed) return 'missing'
  try {
    if (!existsSync(trimmed)) return `missing:${trimmed}`
    return `${trimmed}:${statSync(trimmed).mtimeMs}`
  } catch {
    return `error:${trimmed}`
  }
}
