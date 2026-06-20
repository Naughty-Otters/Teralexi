import { resolveScopedPathInContext } from '../sandbox/paths'

export const READ_FILE_DEFAULT_OFFSET = 1
export const READ_FILE_DEFAULT_LIMIT = 2000
export const READ_FILE_DEFAULT_ENCODING = 'utf8'

export type ToolPathNormalizeContext = {
  sandboxRoot?: string
  workspacePath?: string | null
}

export function normalizeToolPathForKey(
  userPath: string,
  ctx: ToolPathNormalizeContext,
): string {
  const trimmed = userPath.trim()
  if (!trimmed) return ''
  const sandboxRoot = ctx.sandboxRoot?.trim()
  if (!sandboxRoot) return trimmed.replace(/\\/g, '/')
  try {
    return resolveScopedPathInContext(
      sandboxRoot,
      ctx.workspacePath,
      trimmed,
    )
  } catch {
    return trimmed.replace(/\\/g, '/')
  }
}

export function normalizeToolInputForDedupeKey(
  toolName: string,
  input: unknown,
  ctx: ToolPathNormalizeContext,
): unknown {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return input
  }
  const raw = input as Record<string, unknown>

  switch (toolName) {
    case 'read_file': {
      const path = typeof raw.path === 'string' ? raw.path : ''
      return {
        path: normalizeToolPathForKey(path, ctx),
        offset:
          typeof raw.offset === 'number'
            ? raw.offset
            : READ_FILE_DEFAULT_OFFSET,
        limit:
          typeof raw.limit === 'number' ? raw.limit : READ_FILE_DEFAULT_LIMIT,
        encoding:
          typeof raw.encoding === 'string'
            ? raw.encoding
            : READ_FILE_DEFAULT_ENCODING,
      }
    }
    case 'grep_files': {
      const path = typeof raw.path === 'string' ? raw.path : '.'
      return {
        pattern: raw.pattern,
        path: normalizeToolPathForKey(path, ctx),
        include: raw.include ?? undefined,
      }
    }
    case 'glob_files': {
      const path = typeof raw.path === 'string' ? raw.path : '.'
      return {
        pattern: raw.pattern,
        path: normalizeToolPathForKey(path, ctx),
      }
    }
    default:
      return input
  }
}
