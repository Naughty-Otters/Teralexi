import type { HookHandler } from '@teralexi/skill-sdk'

const DESTRUCTIVE_RE = /\b(rm\s+-rf|drop\s+table|delete\s+from)\b/i

/** Fast in-process guard — resolved from hooks.json function-ref binding. */
export const beforeToolCall: HookHandler = async (ctx) => {
  const input = JSON.stringify(ctx.toolInput ?? {})
  if (DESTRUCTIVE_RE.test(input)) {
    return {
      continue: false,
      stopReason: 'Blocked by hook-judge: destructive pattern in tool input',
    }
  }
  return { continue: true }
}
