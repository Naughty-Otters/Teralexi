import { getConversationStore } from '@main/services/conversation-store'

const sessionApprovedCache = new Map<string, Set<string>>()

export function getSessionApprovedTools(conversationId: string): ReadonlySet<string> {
  let cached = sessionApprovedCache.get(conversationId)
  if (!cached) {
    const fromDb = getConversationStore().getSessionApprovedTools(conversationId)
    cached = new Set(fromDb)
    sessionApprovedCache.set(conversationId, cached)
  }
  return cached
}

export function addSessionApprovedTool(conversationId: string, toolName: string): string[] {
  const normalized = toolName.trim()
  if (!normalized) return [...getSessionApprovedTools(conversationId)]
  const set = new Set(getSessionApprovedTools(conversationId))
  set.add(normalized)
  sessionApprovedCache.set(conversationId, set)
  const saved = getConversationStore().addSessionApprovedTool(conversationId, normalized)
  sessionApprovedCache.set(conversationId, new Set(saved))
  return saved
}

export function clearSessionApprovedToolsCache(conversationId?: string): void {
  if (conversationId) sessionApprovedCache.delete(conversationId)
  else sessionApprovedCache.clear()
}

/**
 * Skip HITL approval for tool names the user approved for the rest of the session.
 * Applied after per-stream dedupe so session approval wins.
 */
export function applySessionToolApprovals(
  toolSet: Record<string, { needsApproval?: unknown }>,
  conversationId: string | undefined,
): void {
  if (!conversationId?.trim()) return
  const allowed = getSessionApprovedTools(conversationId)
  if (allowed.size === 0) return

  for (const name of Object.keys(toolSet)) {
    if (!allowed.has(name)) continue
    toolSet[name].needsApproval = false
  }
}
