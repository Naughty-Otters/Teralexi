/**
 * Per-conversation turn hooks. Users register shell commands that run before
 * (`preHook`) or after (`postHook`) each agent turn for that conversation.
 *
 * Global hooks still live in `~/.teralexi/hooks.json` / `.teralexi/hooks.json`;
 * conversation hooks are stored in `conversation_settings.hooks_json` and are
 * merged at invocation time.
 */

export const CONVERSATION_HOOK_EVENTS = ['preHook', 'postHook'] as const

export type ConversationHookEvent = (typeof CONVERSATION_HOOK_EVENTS)[number]

export type ConversationHookEntry = {
  /** Stable id for UI edit/remove; generated when missing. */
  id: string
  event: ConversationHookEvent
  /** Executable to run (PATH lookup or absolute path). */
  command: string
  /** Extra argv before the JSON context payload. */
  args?: string[]
  /** When false, the hook is stored but not executed. Defaults to true. */
  enabled?: boolean
}

export type ConversationHooksConfig = {
  hooks: ConversationHookEntry[]
}

export const EMPTY_CONVERSATION_HOOKS: ConversationHooksConfig = {
  hooks: [],
}

function isConversationHookEvent(value: unknown): value is ConversationHookEvent {
  return (
    typeof value === 'string' &&
    (CONVERSATION_HOOK_EVENTS as readonly string[]).includes(value)
  )
}

function newHookId(): string {
  return `hook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Normalize one hook entry; returns null when command/event are invalid. */
export function parseConversationHookEntry(
  raw: unknown,
): ConversationHookEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (!isConversationHookEvent(row.event)) return null
  const command = typeof row.command === 'string' ? row.command.trim() : ''
  if (!command) return null
  const args = Array.isArray(row.args)
    ? row.args.map((v) => String(v))
    : undefined
  const id =
    typeof row.id === 'string' && row.id.trim()
      ? row.id.trim()
      : newHookId()
  const enabled = row.enabled === false ? false : true
  return {
    id,
    event: row.event,
    command,
    ...(args ? { args } : {}),
    enabled,
  }
}

export function parseConversationHooksConfig(
  raw: unknown,
): ConversationHooksConfig {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CONVERSATION_HOOKS }
  const hooksRaw = (raw as { hooks?: unknown }).hooks
  if (!Array.isArray(hooksRaw)) return { ...EMPTY_CONVERSATION_HOOKS }
  const hooks: ConversationHookEntry[] = []
  for (const item of hooksRaw) {
    const parsed = parseConversationHookEntry(item)
    if (parsed) hooks.push(parsed)
  }
  return { hooks }
}

export function serializeConversationHooksConfig(
  config: ConversationHooksConfig,
): string {
  return JSON.stringify({
    hooks: parseConversationHooksConfig(config).hooks,
  })
}
