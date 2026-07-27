import type { HookRunResult } from '@shared/agent/hooks'

export function applyUpdatedInput<T extends Record<string, unknown>>(
  input: T,
  hookResult: HookRunResult | undefined,
): T {
  const updated = hookResult?.hookSpecificOutput?.updatedInput
  if (!updated || typeof updated !== 'object') return input
  return { ...input, ...updated }
}

export function applyUpdatedInputUnknown(
  input: unknown,
  hookResult: HookRunResult | undefined,
): unknown {
  if (
    input !== null &&
    typeof input === 'object' &&
    !Array.isArray(input)
  ) {
    return applyUpdatedInput(input as Record<string, unknown>, hookResult)
  }
  const updated = hookResult?.hookSpecificOutput?.updatedInput
  if (updated && typeof updated === 'object') return updated
  return input
}

export function applyAdditionalContextToSystemPrompt(
  systemPrompt: string,
  contexts: Array<string | undefined>,
): string {
  const blocks = contexts.filter((c): c is string => Boolean(c?.trim()))
  if (blocks.length === 0) return systemPrompt
  const injected = blocks.map((c) => c.trim()).join('\n\n')
  if (!systemPrompt.trim()) return injected
  return `${systemPrompt.trim()}\n\n${injected}`
}

export function applyAdditionalContextToToolResult(
  result: unknown,
  context: string | undefined,
): unknown {
  if (!context?.trim()) return result
  if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
    return { ...(result as Record<string, unknown>), _hookContext: context.trim() }
  }
  if (typeof result === 'string') {
    return `${result}\n\n[hook context]\n${context.trim()}`
  }
  return { value: result, _hookContext: context.trim() }
}

export function mergeHookResults(
  accumulated: HookRunResult | undefined,
  next: HookRunResult,
): HookRunResult {
  if (next.blocked) return next
  const hookSpecificOutput = {
    ...accumulated?.hookSpecificOutput,
    ...next.hookSpecificOutput,
  }
  return {
    blocked: false,
    ...(Object.keys(hookSpecificOutput).length > 0 ? { hookSpecificOutput } : {}),
  }
}

export function mapPermissionDecision(
  decision: 'allow' | 'deny' | 'ask' | undefined,
): 'user-approval' | 'approved' | 'denied' | undefined {
  switch (decision) {
    case 'allow':
      return 'approved'
    case 'deny':
      return 'denied'
    case 'ask':
      return 'user-approval'
    default:
      return undefined
  }
}
