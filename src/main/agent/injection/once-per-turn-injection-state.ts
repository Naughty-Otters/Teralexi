/**
 * Once-per-user-turn gates for large static instruction injectors
 * (workspace / sandbox structure) so they are not re-assembled on every
 * todo step and every sub-agent stream within the same turn.
 */

const injectedKeys = new Set<string>()

function storageKey(
  injectorId: string,
  args: {
    conversationId?: string
    assistantMessageId?: string
    userMessageId?: string
  },
): string {
  return [
    injectorId,
    args.conversationId?.trim() || '',
    args.assistantMessageId?.trim() || '',
    args.userMessageId?.trim() || '',
  ].join('\0')
}

/** True when this injector has not yet injected for the current user turn. */
export function shouldInjectOncePerTurn(
  injectorId: string,
  args: {
    conversationId?: string
    assistantMessageId?: string
    userMessageId?: string
  },
): boolean {
  // Without conversation identity, always inject (tests / ephemeral runs).
  if (!args.conversationId?.trim() && !args.assistantMessageId?.trim()) {
    return true
  }
  return !injectedKeys.has(storageKey(injectorId, args))
}

export function recordOncePerTurnInjection(
  injectorId: string,
  args: {
    conversationId?: string
    assistantMessageId?: string
    userMessageId?: string
  },
): void {
  if (!args.conversationId?.trim() && !args.assistantMessageId?.trim()) return
  injectedKeys.add(storageKey(injectorId, args))
}

export function clearOncePerTurnInjectionState(
  conversationId?: string,
): void {
  if (!conversationId?.trim()) {
    injectedKeys.clear()
    return
  }
  const conv = conversationId.trim()
  for (const key of [...injectedKeys]) {
    // key = injectorId\0conversationId\0assistant\0user
    const parts = key.split('\0')
    if (parts[1] === conv) injectedKeys.delete(key)
  }
}
