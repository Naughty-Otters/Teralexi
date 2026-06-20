import {
  normalizeToolInputForDedupeKey,
  type ToolPathNormalizeContext,
} from './tool-input-normalize'

/**
 * Compact tool result returned when the same (tool, input) already succeeded
 * in this user turn. Avoids re-sending full file bodies into the LLM context.
 */
export function buildRepeatToolResultStub(
  toolName: string,
  input: unknown,
  pathContext?: ToolPathNormalizeContext,
): unknown {
  const normalized = pathContext
    ? normalizeToolInputForDedupeKey(toolName, input, pathContext)
    : input
  const raw =
    normalized != null && typeof normalized === 'object' && !Array.isArray(normalized)
      ? (normalized as Record<string, unknown>)
      : {}

  switch (toolName) {
    case 'read_file': {
      const path = typeof raw.path === 'string' ? raw.path : 'file'
      return {
        alreadyRead: true,
        path,
        content: '',
        message:
          `Already read in this session: \`${path}\`. Use earlier tool results or the explore manifest — do not call read_file again unless the file changed or you need a different offset/limit.`,
      }
    }
    case 'grep_files': {
      const pattern = String(raw.pattern ?? '')
      const path = typeof raw.path === 'string' ? raw.path : '.'
      return {
        alreadySearched: true,
        pattern,
        path,
        matches: [],
        message:
          `grep_files already ran for pattern \`${pattern}\` under \`${path}\` in this session. Use prior grep results.`,
      }
    }
    case 'glob_files': {
      const pattern = String(raw.pattern ?? '')
      const path = typeof raw.path === 'string' ? raw.path : '.'
      return {
        alreadyListed: true,
        pattern,
        path,
        files: [],
        message:
          `glob_files already ran for \`${pattern}\` under \`${path}\` in this session. Use prior glob results.`,
      }
    }
    case 'web_search':
    case 'deep_research': {
      const query = String(raw.query ?? '')
      return {
        alreadyFetched: true,
        query,
        message: `\`${toolName}\` already ran for this query in this session. Use prior results.`,
      }
    }
    case 'web_scrape': {
      const url = String(raw.url ?? '')
      return {
        alreadyFetched: true,
        url,
        message: `web_scrape already ran for \`${url}\` in this session. Use prior results or the explore manifest.`,
      }
    }
    default:
      return {
        alreadySucceeded: true,
        tool: toolName,
        message: `This tool already succeeded with the same inputs in this session. Use prior tool results.`,
      }
  }
}
