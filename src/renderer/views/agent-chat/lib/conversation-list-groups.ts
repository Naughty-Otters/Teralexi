import { workspaceBasename } from '@shared/agent/workspace'

export type ConversationListGroupBy = 'none' | 'agent' | 'workspace'

export const CONVERSATION_LIST_GROUP_BY_VALUES = [
  'none',
  'agent',
  'workspace',
] as const satisfies readonly ConversationListGroupBy[]

export const NO_WORKSPACE_GROUP_KEY = '__none__'

export type ConversationListGroupItem = {
  id: string
  agentId: string
  updatedAt: Date
  workspacePath?: string | null
}

export type ConversationListGroup<T extends ConversationListGroupItem> = {
  key: string
  label: string
  items: T[]
}

export function parseConversationListGroupBy(
  raw: string | null | undefined,
): ConversationListGroupBy {
  const value = raw?.trim()
  if (value === 'agent' || value === 'workspace' || value === 'none') {
    return value
  }
  return 'none'
}

function sortByUpdatedAtDesc<T extends ConversationListGroupItem>(
  items: T[],
): T[] {
  return items
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

/**
 * Bucket conversations for the sidebar. Items within each group and groups
 * themselves are ordered by most recent `updatedAt`.
 */
export function groupConversations<T extends ConversationListGroupItem>(
  items: readonly T[],
  mode: ConversationListGroupBy,
  resolveAgentLabel: (agentId: string) => string,
): ConversationListGroup<T>[] {
  if (mode === 'none') {
    return [
      {
        key: 'all',
        label: '',
        items: sortByUpdatedAtDesc([...items]),
      },
    ]
  }

  const buckets = new Map<string, { label: string; items: T[] }>()

  for (const item of items) {
    let key: string
    let label: string
    if (mode === 'agent') {
      key = item.agentId
      label = resolveAgentLabel(item.agentId) || 'Unknown agent'
    } else {
      const path = item.workspacePath?.trim() || ''
      if (!path) {
        key = NO_WORKSPACE_GROUP_KEY
        label = 'No workspace'
      } else {
        key = path
        label = workspaceBasename(path) || path
      }
    }

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.items.push(item)
    } else {
      buckets.set(key, { label, items: [item] })
    }
  }

  const groups: ConversationListGroup<T>[] = [...buckets.entries()].map(
    ([key, bucket]) => ({
      key,
      label: bucket.label,
      items: sortByUpdatedAtDesc(bucket.items),
    }),
  )

  groups.sort((a, b) => {
    const aTime = a.items[0]?.updatedAt.getTime() ?? 0
    const bTime = b.items[0]?.updatedAt.getTime() ?? 0
    return bTime - aTime
  })

  return groups
}
