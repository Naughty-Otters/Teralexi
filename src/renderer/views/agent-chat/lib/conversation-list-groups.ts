import { workspaceBasename } from '@shared/agent/workspace'
import {
  classifyConversationSessionId,
  parseChannelIdFromConversationId,
} from '@shared/conversation/session-id'

export type ConversationListGroupBy =
  | 'none'
  | 'agent'
  | 'workspace'
  | 'source'

export const CONVERSATION_LIST_GROUP_BY_VALUES = [
  'none',
  'agent',
  'workspace',
  'source',
] as const satisfies readonly ConversationListGroupBy[]

export const NO_WORKSPACE_GROUP_KEY = '__none__'
export const APP_DATA_SOURCE_GROUP_KEY = 'app'
export const SCHEDULER_DATA_SOURCE_GROUP_KEY = 'scheduler'

export type ConversationListGroupItem = {
  id: string
  agentId: string
  updatedAt: Date
  workspacePath?: string | null
  type?: 'ui' | 'channel' | 'scheduler'
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
  if (
    value === 'agent' ||
    value === 'workspace' ||
    value === 'source' ||
    value === 'none'
  ) {
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

function titleCaseChannelId(channelId: string): string {
  const known: Record<string, string> = {
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    wechat: 'WeChat',
    slack: 'Slack',
  }
  const normalized = channelId.trim().toLowerCase()
  if (known[normalized]) return known[normalized]
  if (!normalized) return 'Channel'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

/** Resolve sidebar group key/label for group-by data source. */
export function resolveConversationDataSourceGroup(item: {
  id: string
  type?: 'ui' | 'channel' | 'scheduler'
}): { key: string; label: string } {
  const kind = item.type ?? classifyConversationSessionId(item.id)
  if (kind === 'scheduler') {
    return { key: SCHEDULER_DATA_SOURCE_GROUP_KEY, label: 'Scheduler' }
  }
  if (kind === 'channel') {
    const channelId = parseChannelIdFromConversationId(item.id) ?? 'channel'
    return {
      key: `channel:${channelId}`,
      label: titleCaseChannelId(channelId),
    }
  }
  return { key: APP_DATA_SOURCE_GROUP_KEY, label: 'App' }
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
    } else if (mode === 'workspace') {
      const path = item.workspacePath?.trim() || ''
      if (!path) {
        key = NO_WORKSPACE_GROUP_KEY
        label = 'No workspace'
      } else {
        key = path
        label = workspaceBasename(path) || path
      }
    } else {
      const source = resolveConversationDataSourceGroup(item)
      key = source.key
      label = source.label
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
    // Keep App first, then channels / scheduler by recency.
    if (mode === 'source') {
      if (a.key === APP_DATA_SOURCE_GROUP_KEY && b.key !== APP_DATA_SOURCE_GROUP_KEY) {
        return -1
      }
      if (b.key === APP_DATA_SOURCE_GROUP_KEY && a.key !== APP_DATA_SOURCE_GROUP_KEY) {
        return 1
      }
    }
    const aTime = a.items[0]?.updatedAt.getTime() ?? 0
    const bTime = b.items[0]?.updatedAt.getTime() ?? 0
    return bTime - aTime
  })

  return groups
}
