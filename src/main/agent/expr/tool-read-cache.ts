import { statSync } from 'node:fs'
import { createLogger } from '@main/logger'
import {
  normalizeToolInputForDedupeKey,
  normalizeToolPathForKey,
  type ToolPathNormalizeContext,
} from './tool-input-normalize'
import {
  readFileReasonFromInput,
  stripReadFileReasonFromInput,
} from './read-file-reason'

const log = createLogger('agent.expr.tool-read-cache')

type CacheEntry = {
  result: unknown
  fileMtimeMs?: number
}

export class ToolReadCache {
  private readonly entries = new Map<string, CacheEntry>()

  buildKey(input: unknown, ctx: ToolPathNormalizeContext): string {
    const normalized = normalizeToolInputForDedupeKey('read_file', input, ctx)
    return `read_file\0${JSON.stringify(normalized)}`
  }

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key)
  }

  set(key: string, entry: CacheEntry): void {
    this.entries.set(key, entry)
  }

  /** Normalized paths successfully cached this user turn (for instruction ledger). */
  listReadPaths(): string[] {
    const paths = new Set<string>()
    for (const key of this.entries.keys()) {
      if (!key.startsWith('read_file\0')) continue
      try {
        const parsed = JSON.parse(key.slice('read_file\0'.length)) as {
          path?: string
        }
        if (parsed.path?.trim()) paths.add(parsed.path.trim())
      } catch {
        /* ignore malformed keys */
      }
    }
    return [...paths].sort((a, b) => a.localeCompare(b))
  }
}

function readFileResultIsCacheable(result: unknown): boolean {
  if (result == null || typeof result !== 'object') return false
  const r = result as Record<string, unknown>
  if (typeof r.error === 'string' && r.error) return false
  if (r.isDirectory === true) return false
  return typeof r.content === 'string'
}

function fileMtimeFromResult(result: unknown): number | undefined {
  const modifiedAt = (result as Record<string, unknown>)?.modifiedAt
  if (typeof modifiedAt === 'string') {
    const ms = Date.parse(modifiedAt)
    if (!Number.isNaN(ms)) return ms
  }
  return undefined
}

function isCacheEntryFresh(entry: CacheEntry, resolvedPath: string): boolean {
  if (entry.fileMtimeMs == null) return true
  try {
    return statSync(resolvedPath).mtimeMs === entry.fileMtimeMs
  } catch {
    return false
  }
}

export function applyRunScopedReadCache(
  toolSet: Record<string, unknown>,
  opts: {
    cache: ToolReadCache
    getPathContext: () => ToolPathNormalizeContext
  },
): void {
  const spec = toolSet.read_file as Record<string, unknown> | null
  if (!spec || typeof spec.execute !== 'function') return

  const origExecute = (
    spec.execute as (input: unknown) => Promise<unknown>
  ).bind(spec)

  spec.execute = async (input: unknown) => {
    const reason = readFileReasonFromInput(input)
    const stripped = stripReadFileReasonFromInput(input)
    const ctx = opts.getPathContext()
    const key = opts.cache.buildKey(stripped, ctx)
    const cached = opts.cache.get(key)

    if (!reason && cached) {
      const rawPath = (stripped as Record<string, unknown>)?.path
      if (typeof rawPath === 'string') {
        const resolved = normalizeToolPathForKey(rawPath, ctx)
        if (resolved && isCacheEntryFresh(cached, resolved)) {
          log.debug('read_file cache hit', { path: resolved })
          return cached.result
        }
      }
    }

    const result = await origExecute(stripped)
    if (!readFileResultIsCacheable(result)) return result

    let fileMtimeMs: number | undefined
    const rawPath = (stripped as Record<string, unknown>)?.path
    if (typeof rawPath === 'string') {
      try {
        const resolved = normalizeToolPathForKey(rawPath, ctx)
        fileMtimeMs = statSync(resolved).mtimeMs
      } catch {
        /* ignore stat errors */
      }
    }
    if (fileMtimeMs == null) {
      fileMtimeMs = fileMtimeFromResult(result)
    }

    opts.cache.set(key, { result, fileMtimeMs })
    return result
  }
}
