/**
 * Tool-call loop guardrails — inspired by hermes-agent's ToolCallGuardrailController.
 *
 * Tracks repeated failed/non-progressing tool calls within a single tool-loop
 * execution and produces typed decisions (allow / warn / block / halt) that
 * callers convert into model-visible guidance or controlled loop termination.
 *
 * Pure logic: no side effects, no imports from agent context.
 * Wire-up lives in applyToolGuardrails().
 */

import { createHash } from 'crypto'
import { createLogger } from '@main/logger'
import { classifyToolFailure } from './tool-failure'
import { serializeForToolLog } from './tool-log-utils'

const guardrailLog = createLogger('agent.tool-call')
const log = createLogger('agent.expr.tool-guardrails')

export { classifyToolFailure } from './tool-failure'

// ---------------------------------------------------------------------------
// Tool classification sets
// ---------------------------------------------------------------------------

/** Read-only tools: repeated same call → same result = no progress. */
const IDEMPOTENT_TOOLS = new Set([
  'read_file',
  'list_files',
  'search_files',
  'file_status',
  'storage_check',
  'git_status',
  'git_diff',
  'git_log',
  'git_show',
  'web_search',
  'web_scrape',
  'deep_research',
])

/** Write tools: never treated as idempotent no-progress (each call has side effects). */
const MUTATING_TOOLS = new Set([
  'write_file',
  'move_file',
  'copy_file',
  'promote_artifact',
  'run_script',
  'run_script_file',
  'git_add',
  'git_commit',
  'git_push',
  'git_pull',
  'git_fetch',
  'git_checkout',
  'git_merge',
  'git_rebase',
  'git_reset',
  'git_stash',
  'git_branch',
  'git_cherry_pick',
  'git_revert',
])

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GuardrailConfig {
  /** Emit warnings to the model (appended to tool results). Default: true */
  warningsEnabled: boolean
  /** Hard-stop the loop on repeated failures. Default: true */
  hardStopEnabled: boolean
  /** Warn after N exact same-args failures for one tool call signature. Default: 2 */
  exactFailureWarnAfter: number
  /** Block (pre-call) after N exact same-args failures. Default: 5 */
  exactFailureBlockAfter: number
  /** Warn after N total failures on the same tool name. Default: 3 */
  sameToolFailureWarnAfter: number
  /** Halt (post-call) after N total failures on the same tool name. Default: 8 */
  sameToolFailureHaltAfter: number
  /** Warn after N idempotent calls returning identical results. Default: 2 */
  noProgressWarnAfter: number
  /** Block (pre-call) after N idempotent no-progress repeats. Default: 4 */
  noProgressBlockAfter: number
}

const DEFAULT_CONFIG: GuardrailConfig = {
  warningsEnabled: true,
  hardStopEnabled: true,
  exactFailureWarnAfter: 2,
  exactFailureBlockAfter: 5,
  sameToolFailureWarnAfter: 3,
  sameToolFailureHaltAfter: 8,
  noProgressWarnAfter: 2,
  noProgressBlockAfter: 4,
}

// ---------------------------------------------------------------------------
// Decision types
// ---------------------------------------------------------------------------

export type GuardrailAction = 'allow' | 'warn' | 'block' | 'halt'

export interface GuardrailDecision {
  action: GuardrailAction
  code: string
  message: string
  toolName: string
  count: number
}

function allow(toolName: string): GuardrailDecision {
  return { action: 'allow', code: 'allow', message: '', toolName, count: 0 }
}

function decision(
  action: GuardrailAction,
  code: string,
  message: string,
  toolName: string,
  count: number,
): GuardrailDecision {
  return { action, code, message, toolName, count }
}

// ---------------------------------------------------------------------------
// Hashing utilities
// ---------------------------------------------------------------------------

/** Stable SHA-256 fingerprint of canonical (sorted) tool arguments. */
function argHash(args: unknown): string {
  let canonical: string
  try {
    canonical = JSON.stringify(
      sortKeys(args as Record<string, unknown>),
      (_k, v) => (v === undefined ? null : v),
    )
  } catch {
    canonical = String(args)
  }
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

function resultHash(result: unknown): string {
  let canonical: string
  if (typeof result === 'string') {
    canonical = result
  } else {
    try {
      canonical = JSON.stringify(
        sortKeys(result as Record<string, unknown>),
        (_k, v) => (v === undefined ? null : v),
      )
    } catch {
      canonical = String(result)
    }
  }
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

function callKey(toolName: string, args: unknown): string {
  return `${toolName}:${argHash(args)}`
}

function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sortKeys)
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(obj as object).sort()) {
    sorted[k] = sortKeys((obj as Record<string, unknown>)[k])
  }
  return sorted
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * Per-tool-loop execution guardrail controller.
 *
 * Instantiate once per `executeTodoToolLoop` / `runStandaloneAgent` call.
 * Call `reset()` between retries if you want fresh state.
 */
export class ToolGuardrailController {
  private readonly cfg: GuardrailConfig

  /** exactKey → consecutive failure count (resets on success) */
  private exactFailureCounts = new Map<string, number>()
  /** toolName → total failure count this execution */
  private sameToolFailureCounts = new Map<string, number>()
  /** exactKey → { resultHash, repeatCount } for idempotent no-progress */
  private noProgress = new Map<string, { hash: string; count: number }>()

  private _lastHaltDecision: GuardrailDecision | null = null

  constructor(config?: Partial<GuardrailConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  get lastHaltDecision(): GuardrailDecision | null {
    return this._lastHaltDecision
  }

  reset(): void {
    this.exactFailureCounts.clear()
    this.sameToolFailureCounts.clear()
    this.noProgress.clear()
    this._lastHaltDecision = null
  }

  /**
   * Check before executing a tool call.
   * Returns `block` if hard-stop thresholds are already breached.
   */
  beforeCall(toolName: string, args: unknown): GuardrailDecision {
    const key = callKey(toolName, args)

    if (this.cfg.hardStopEnabled) {
      const exactCount = this.exactFailureCounts.get(key) ?? 0
      if (exactCount >= this.cfg.exactFailureBlockAfter) {
        const d = decision(
          'block',
          'repeated_exact_failure_block',
          `Blocked ${toolName}: the same call failed ${exactCount} times with identical arguments. ` +
            'Stop retrying it unchanged — change strategy or report the blocker.',
          toolName,
          exactCount,
        )
        this._lastHaltDecision = d
        log.warn('Guardrail block (pre-call)', { toolName, key, exactCount })
        return d
      }

      if (this.isIdempotent(toolName)) {
        const record = this.noProgress.get(key)
        if (record && record.count >= this.cfg.noProgressBlockAfter) {
          const d = decision(
            'block',
            'idempotent_no_progress_block',
            `Blocked ${toolName}: this read-only call returned the same result ${record.count} times. ` +
              'Stop repeating it — use the result already provided or try a different query.',
            toolName,
            record.count,
          )
          this._lastHaltDecision = d
          log.warn('Guardrail block (idempotent no-progress)', {
            toolName,
            key,
            count: record.count,
          })
          return d
        }
      }
    }

    return allow(toolName)
  }

  /**
   * Record outcome after executing a tool call.
   * Returns `warn` or `halt` when thresholds are crossed.
   */
  afterCall(
    toolName: string,
    args: unknown,
    result: unknown,
    failed?: boolean,
  ): GuardrailDecision {
    const key = callKey(toolName, args)
    const isFailed = failed ?? classifyToolFailure(toolName, result)

    if (isFailed) {
      const exactCount = (this.exactFailureCounts.get(key) ?? 0) + 1
      this.exactFailureCounts.set(key, exactCount)
      this.noProgress.delete(key) // failure resets no-progress tracking

      const sameToolCount = (this.sameToolFailureCounts.get(toolName) ?? 0) + 1
      this.sameToolFailureCounts.set(toolName, sameToolCount)

      if (this.cfg.hardStopEnabled && sameToolCount >= this.cfg.sameToolFailureHaltAfter) {
        const d = decision(
          'halt',
          'same_tool_failure_halt',
          `Halting: ${toolName} failed ${sameToolCount} times this execution. ` +
            'Stop retrying this tool path and choose a different approach.',
          toolName,
          sameToolCount,
        )
        this._lastHaltDecision = d
        log.warn('Guardrail halt', { toolName, sameToolCount })
        return d
      }

      if (this.cfg.warningsEnabled && exactCount >= this.cfg.exactFailureWarnAfter) {
        log.debug('Guardrail warn (repeated exact failure)', { toolName, key, exactCount })
        return decision(
          'warn',
          'repeated_exact_failure_warning',
          `${toolName} failed ${exactCount} times with identical arguments. ` +
            'This looks like a loop — inspect the error and change strategy instead of retrying unchanged.',
          toolName,
          exactCount,
        )
      }

      if (this.cfg.warningsEnabled && sameToolCount >= this.cfg.sameToolFailureWarnAfter) {
        log.debug('Guardrail warn (same-tool failures)', { toolName, sameToolCount })
        return decision(
          'warn',
          'same_tool_failure_warning',
          toolFailureRecoveryHint(toolName, sameToolCount),
          toolName,
          sameToolCount,
        )
      }

      return allow(toolName)
    }

    // Success path
    this.exactFailureCounts.delete(key)
    this.sameToolFailureCounts.delete(toolName)

    if (!this.isIdempotent(toolName)) {
      this.noProgress.delete(key)
      return allow(toolName)
    }

    // Idempotent success — track no-progress
    const rHash = resultHash(result)
    const previous = this.noProgress.get(key)
    const repeatCount = previous?.hash === rHash ? previous.count + 1 : 1
    this.noProgress.set(key, { hash: rHash, count: repeatCount })

    if (this.cfg.warningsEnabled && repeatCount >= this.cfg.noProgressWarnAfter) {
      log.debug('Guardrail warn (idempotent no-progress)', {
        toolName,
        key,
        repeatCount,
      })
      return decision(
        'warn',
        'idempotent_no_progress_warning',
        `${toolName} returned the same result ${repeatCount} times. ` +
          'Use the result already provided or change the query instead of repeating it unchanged.',
        toolName,
        repeatCount,
      )
    }

    return allow(toolName)
  }

  private isIdempotent(toolName: string): boolean {
    if (MUTATING_TOOLS.has(toolName)) return false
    return IDEMPOTENT_TOOLS.has(toolName)
  }
}

// ---------------------------------------------------------------------------
// Toolset integration
// ---------------------------------------------------------------------------

/**
 * Wrap each tool's execute() in the toolset with guardrail checks.
 *
 * - beforeCall block → return synthetic error result (tool not executed)
 * - afterCall warn   → append warning text to tool result
 * - afterCall halt   → append warning text AND signal haltCtrl to stop the agent
 *
 * **Wrap order in `buildAgentToolSet`:** guardrails first, then
 * {@link applyPerStreamToolInputDedupe} (dedupe is outer). Dedupe cache hits skip
 * guardrail beforeCall/afterCall — intentional: identical successful inputs are not
 * re-executed. Guardrails still see every distinct input and every failed execution.
 */
export function applyToolGuardrails(
  toolSet: Record<string, unknown>,
  controller: ToolGuardrailController,
  haltCtrl: AbortController,
): void {
  for (const name of Object.keys(toolSet)) {
    const spec = toolSet[name] as Record<string, unknown> | null
    if (!spec || typeof spec['execute'] !== 'function') continue

    const origExecute = (spec['execute'] as (...a: unknown[]) => Promise<unknown>).bind(spec)

    spec['execute'] = async (input: unknown): Promise<unknown> => {
      // Pre-call check
      const pre = controller.beforeCall(name, input)
      if (pre.action === 'block' || pre.action === 'halt') {
        guardrailLog.warn('tool call blocked by guardrail', {
          toolName: name,
          action: pre.action,
          reason: pre.reason,
          input: serializeForToolLog(input),
        })
        return guardrailSyntheticResult(pre)
      }

      let result: unknown
      let failed = false

      try {
        result = await origExecute(input)
        failed = classifyToolFailure(name, result)
      } catch (err) {
        guardrailLog.error('tool call threw (guardrail wrapper)', {
          toolName: name,
          input: serializeForToolLog(input),
          errorMessage: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : undefined,
        })
        controller.afterCall(name, input, null, true)
        if (controller.lastHaltDecision?.action === 'halt') {
          haltCtrl.abort('guardrail-halt')
        }
        throw err
      }

      const post = controller.afterCall(name, input, result, failed)

      if (post.action === 'halt') {
        haltCtrl.abort('guardrail-halt')
        return appendGuardrailWarning(result, post)
      }

      if (post.action === 'warn') {
        return appendGuardrailWarning(result, post)
      }

      return result
    }
  }
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function guardrailSyntheticResult(d: GuardrailDecision): Record<string, unknown> {
  return { error: d.message, guardrail: d.code }
}

function appendGuardrailWarning(result: unknown, d: GuardrailDecision): unknown {
  const tag = d.action === 'halt' ? 'Tool loop hard stop' : 'Tool loop warning'
  const suffix = `\n\n[${tag}: ${d.code}; count=${d.count}. ${d.message}]`

  if (typeof result === 'string') {
    return result + suffix
  }
  if (typeof result === 'object' && result !== null) {
    return { ...(result as object), _guardrailWarning: suffix.trim() }
  }
  return String(result ?? '') + suffix
}

// ---------------------------------------------------------------------------
// Recovery hint text
// ---------------------------------------------------------------------------

function toolFailureRecoveryHint(toolName: string, count: number): string {
  const common =
    `${toolName} failed ${count} times this execution. This looks like a loop. ` +
    'Do not switch to text-only replies — keep using tools, but diagnose before retrying. ' +
    'Inspect the latest error and verify your assumptions. '

  if (toolName === 'run_script' || toolName === 'run_script_file') {
    return (
      common +
      'Check exit code / stderr. Try a simpler diagnostic script first, ' +
      'verify paths and permissions, or split the script into smaller steps.'
    )
  }

  return (
    common +
    'Try different arguments, a narrower query, an absolute path, ' +
    'or a different tool. If the blocker is external, report it rather than repeating the same failing path.'
  )
}
