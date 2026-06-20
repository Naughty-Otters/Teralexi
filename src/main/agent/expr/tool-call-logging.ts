import { createLogger } from '@main/logger'
import { classifyToolFailure } from './tool-failure'
import { serializeForToolLog } from './tool-log-utils'

export { serializeForToolLog } from './tool-log-utils'

const log = createLogger('agent.tool-call')

const MAX_INPUT_LOG_CHARS = 4_000

export type ToolCallLogMeta = {
  toolName: string
  skillId?: string
  conversationId?: string
  agentId?: string
  stepId?: string
  source?: 'skill' | 'mcp' | 'invoke' | 'ipc' | 'legacy'
}

function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack?.split('\n').slice(0, 12).join('\n'),
    }
  }
  return { errorMessage: String(err) }
}

/**
 * Run a tool implementation with consistent start/end/error logging.
 * Thrown errors are always rethrown after logging. Soft failures
 * (`success: false`, `error`, non-zero `exit_code`) are logged at warn.
 */
export async function runLoggedToolExecute(
  meta: ToolCallLogMeta,
  input: unknown,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  const startedAt = Date.now()
  log.info('tool call start', {
    ...meta,
    input: serializeForToolLog(input, MAX_INPUT_LOG_CHARS),
  })

  try {
    const result = await fn()
    const durationMs = Date.now() - startedAt
    const softFailure = classifyToolFailure(meta.toolName, result)

    if (softFailure) {
      log.warn('tool call returned failure result', {
        ...meta,
        durationMs,
        result: serializeForToolLog(result),
      })
    } else {
      log.info('tool call completed', {
        ...meta,
        durationMs,
        result: serializeForToolLog(result),
      })
    }

    return result
  } catch (err) {
    log.error('tool call failed', {
      ...meta,
      durationMs: Date.now() - startedAt,
      input: serializeForToolLog(input, MAX_INPUT_LOG_CHARS),
      ...errorFields(err),
    })
    throw err
  }
}
