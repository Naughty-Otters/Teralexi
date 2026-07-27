import type { HookEvent } from '@shared/agent/hooks'

/** Maps alternate hook event names to canonical runtime names. */
const HOOK_EVENT_ALIASES: Record<string, HookEvent> = {
  PreToolUse: 'beforeToolCall',
  PostToolUse: 'afterToolCall',
  PermissionRequest: 'onApprovalRequired',
}

export function normalizeHookEvent(event: string): HookEvent | null {
  const trimmed = event.trim()
  if (!trimmed) return null
  if (trimmed in HOOK_EVENT_ALIASES) {
    return HOOK_EVENT_ALIASES[trimmed]
  }
  return trimmed as HookEvent
}
