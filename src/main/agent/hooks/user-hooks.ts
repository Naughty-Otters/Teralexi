import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  ConversationHookEntry,
  ConversationHookEvent,
} from '@shared/agent/conversation-hooks'

const execFileAsync = promisify(execFile)

export type UserHookEvent =
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'onSessionStart'
  | 'onApprovalRequired'
  | ConversationHookEvent

export type UserHookEntry = {
  event: UserHookEvent
  command: string
  args?: string[]
  /** Optional id when sourced from per-conversation settings. */
  id?: string
  enabled?: boolean
}

export type UserHooksConfig = {
  hooks: UserHookEntry[]
}

export type HookInvocationContext = {
  event: UserHookEvent
  conversationId?: string
  agentId?: string
  assistantMessageId?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown
  workspacePath?: string | null
  /** Plain-text user message for the current turn (pre/post hooks). */
  userMessage?: string
  hasError?: boolean
  errorMessage?: string
  finalContent?: string
}

const HOOK_PATHS = [
  join(homedir(), '.teralexi', 'hooks.json'),
  join(process.cwd(), '.teralexi', 'hooks.json'),
]

/** Events where a failed hook or stderr blocks the action. */
const BLOCKING_HOOK_EVENTS = new Set<UserHookEvent>([
  'beforeToolCall',
  'preHook',
])

let cachedConfig: UserHooksConfig | null | undefined

export function clearUserHooksCache(): void {
  cachedConfig = undefined
}

export function loadUserHooksConfig(): UserHooksConfig {
  if (cachedConfig !== undefined) return cachedConfig ?? { hooks: [] }
  for (const p of HOOK_PATHS) {
    if (!existsSync(p)) continue
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8')) as UserHooksConfig
      cachedConfig = {
        hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
      }
      return cachedConfig
    } catch {
      continue
    }
  }
  cachedConfig = { hooks: [] }
  return cachedConfig
}

function isEnabled(entry: UserHookEntry | ConversationHookEntry): boolean {
  return entry.enabled !== false
}

function toRunnableEntries(
  entries: Array<UserHookEntry | ConversationHookEntry>,
  event: UserHookEvent,
): UserHookEntry[] {
  return entries
    .filter((h) => h.event === event && isEnabled(h) && h.command?.trim())
    .map((h) => ({
      event: h.event,
      command: h.command.trim(),
      args: h.args,
      id: 'id' in h ? h.id : undefined,
      enabled: h.enabled,
    }))
}

/**
 * Run matching hooks for an event.
 *
 * Global config (`hooks.json`) runs first, then optional per-conversation
 * `extraHooks`. `preHook` and `beforeToolCall` can block on stderr or failure.
 */
export async function runUserHooks(
  ctx: HookInvocationContext,
  extraHooks: Array<UserHookEntry | ConversationHookEntry> = [],
): Promise<{ blocked: boolean; message?: string }> {
  const config = loadUserHooksConfig()
  const entries = [
    ...toRunnableEntries(config.hooks, ctx.event),
    ...toRunnableEntries(extraHooks, ctx.event),
  ]
  if (entries.length === 0) return { blocked: false }

  const payload = JSON.stringify(ctx)
  const blocking = BLOCKING_HOOK_EVENTS.has(ctx.event)

  for (const entry of entries) {
    try {
      const { stderr } = await execFileAsync(
        entry.command,
        [...(entry.args ?? []), payload],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      )
      if (stderr?.trim() && blocking) {
        return { blocked: true, message: stderr.trim() }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (blocking) {
        return { blocked: true, message: `Hook blocked: ${msg}` }
      }
    }
  }
  return { blocked: false }
}
