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
import type { ToolReadCache } from './tool-read-cache'

const log = createLogger('agent.expr.read-file-ledger-gate')

function cacheEntryIsFresh(
  entry: { fileMtimeMs?: number },
  resolvedPath: string,
): boolean {
  if (entry.fileMtimeMs == null) return true
  try {
    return statSync(resolvedPath).mtimeMs === entry.fileMtimeMs
  } catch {
    return false
  }
}

export function buildReadFileRepeatWithoutReasonError(
  path: string,
  offset: number,
  limit: number,
): Record<string, unknown> {
  return {
    error:
      `Already read \`${path}\` (offset=${offset}, limit=${limit}) in this session. ` +
      'Do not call read_file again with the same window. Either use content from earlier tool results / the explore manifest, ' +
      `pass a new \`offset\` (see the prior result's \`note\` for the next line), or include a short \`reason\` why you need a fresh read (e.g. file was edited).`,
    path,
    offset,
    limit,
    requiresReason: true,
  }
}

/**
 * Blocks repeat `read_file` for the same path+offset+limit unless `reason` is set
 * or the file mtime changed. Apply after {@link applyRunScopedReadCache}, before dedupe.
 */
export function applyReadFileLedgerGate(
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

    if (cached && !reason) {
      const normalized = normalizeToolInputForDedupeKey(
        'read_file',
        stripped,
        ctx,
      ) as { path?: string; offset?: number; limit?: number }
      const path = typeof normalized.path === 'string' ? normalized.path : 'file'
      const offset = normalized.offset ?? 1
      const limit = normalized.limit ?? 2000
      const resolved = normalizeToolPathForKey(path, ctx)
      if (!resolved || cacheEntryIsFresh(cached, resolved)) {
        log.debug('read_file ledger gate: repeat without reason', { path })
        return buildReadFileRepeatWithoutReasonError(path, offset, limit)
      }
    }

    return origExecute(input)
  }
}
