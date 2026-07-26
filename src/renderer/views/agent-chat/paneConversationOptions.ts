import type { Conversation } from '@store/agent'

export type PaneConversationOption = {
  id: string
  label: string
}

/**
 * Conversations the focused pane can switch to:
 * - the current pane conversation
 * - conversations not open in any pane (inactive)
 * - the latest conversation even if open in another pane
 */
export function buildPaneConversationOptions(opts: {
  conversations: readonly Conversation[]
  openConversationIds: ReadonlySet<string> | readonly string[]
  currentConversationId: string | null | undefined
}): PaneConversationOption[] {
  const openIds = new Set(
    [...opts.openConversationIds].map((id) => id.trim()).filter(Boolean),
  )
  const currentId = opts.currentConversationId?.trim() || null
  const allUi = opts.conversations

  let latestId: string | null = null
  let latestUpdated = -Infinity
  for (const conv of allUi) {
    const t = conv.updatedAt?.getTime?.() ?? 0
    if (t > latestUpdated) {
      latestUpdated = t
      latestId = conv.id
    }
  }

  const selected = new Map<
    string,
    { id: string; label: string; updatedAt: number }
  >()
  for (const conv of allUi) {
    const isCurrent = conv.id === currentId
    const isOpen = openIds.has(conv.id)
    const isLatest = conv.id === latestId
    if (!(isCurrent || !isOpen || isLatest)) continue
    selected.set(conv.id, {
      id: conv.id,
      label: conv.title?.trim() || 'Conversation',
      updatedAt: conv.updatedAt?.getTime?.() ?? 0,
    })
  }

  if (currentId && !selected.has(currentId)) {
    selected.set(currentId, {
      id: currentId,
      label: 'Conversation',
      updatedAt: 0,
    })
  }

  return [...selected.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ id, label }) => ({
      id,
      label:
        id === latestId && id !== currentId ? `${label} (latest)` : label,
    }))
}
