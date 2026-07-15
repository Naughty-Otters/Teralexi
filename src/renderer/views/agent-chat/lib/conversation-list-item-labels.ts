export type ConversationListLabelField = 'type' | 'agent' | 'date'

export type ConversationListItemLabels = Record<ConversationListLabelField, boolean>

export const CONVERSATION_LIST_LABEL_FIELDS = [
  'type',
  'agent',
  'date',
] as const satisfies readonly ConversationListLabelField[]

/** Default: all off — conversation rows show title only. */
export const DEFAULT_CONVERSATION_LIST_ITEM_LABELS: ConversationListItemLabels = {
  type: false,
  agent: false,
  date: false,
}

export const CONVERSATION_LIST_LABEL_OPTIONS: Array<{
  value: ConversationListLabelField
  label: string
}> = [
  { value: 'type', label: 'Type' },
  { value: 'agent', label: 'Agent' },
  { value: 'date', label: 'Date' },
]

export function parseConversationListItemLabels(
  raw: string | null | undefined,
): ConversationListItemLabels {
  const defaults = { ...DEFAULT_CONVERSATION_LIST_ITEM_LABELS }
  if (!raw?.trim()) return defaults
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults
    }
    const record = parsed as Record<string, unknown>
    for (const field of CONVERSATION_LIST_LABEL_FIELDS) {
      if (typeof record[field] === 'boolean') {
        defaults[field] = record[field]
      }
    }
    return defaults
  } catch {
    return defaults
  }
}

export function serializeConversationListItemLabels(
  value: ConversationListItemLabels,
): string {
  return JSON.stringify({
    type: value.type === true,
    agent: value.agent === true,
    date: value.date === true,
  })
}

export type ConversationMetaLineInput = {
  type: 'ui' | 'channel' | 'scheduler'
  agentName: string
  updatedAt: Date
}

export function sessionTypeLabel(
  type: ConversationMetaLineInput['type'],
): string {
  if (type === 'channel') return 'Channel'
  if (type === 'scheduler') return 'Scheduler'
  return 'Chat'
}

export function formatConversationListDate(date: Date): string {
  return new Date(date).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Build the subtitle under a conversation title.
 * When group-by is agent, agent name is omitted even if the label toggle is on.
 */
export function buildConversationMetaLine(
  conv: ConversationMetaLineInput,
  labels: ConversationListItemLabels,
  options?: { groupByMode?: 'none' | 'agent' | 'workspace' | 'source' },
): string {
  const parts: string[] = []
  if (labels.type && options?.groupByMode !== 'source') {
    parts.push(sessionTypeLabel(conv.type))
  }
  if (labels.agent && options?.groupByMode !== 'agent') {
    parts.push(conv.agentName)
  }
  if (labels.date) parts.push(formatConversationListDate(conv.updatedAt))
  return parts.join(' · ')
}
