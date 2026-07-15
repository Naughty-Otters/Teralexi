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

export type ConversationDetailTooltipInput = {
  title: string
  type: ConversationMetaLineInput['type']
  agentName: string
  /** e.g. "Skill · website" or "Custom" */
  agentType?: string | null
  updatedAt: Date
  workspacePath?: string | null
  messageCount?: number
}

export type ConversationDetailTooltipRow = {
  label: string
  value: string
}

export type ConversationDetailTooltipModel = {
  title: string
  rows: ConversationDetailTooltipRow[]
}

/** Human-readable agent classification for conversation tooltips. */
export function formatAgentTypeLabel(agent: {
  isSkill?: boolean
  skillId?: string | null
  skillGroupLabel?: string | null
  skillVariantLabel?: string | null
} | null | undefined): string {
  if (!agent?.isSkill) return 'Custom'
  const skill =
    agent.skillGroupLabel?.trim() ||
    agent.skillId?.trim() ||
    'Skill'
  const variant = agent.skillVariantLabel?.trim()
  if (variant && variant.toLowerCase() !== skill.toLowerCase()) {
    return `Skill · ${skill} · ${variant}`
  }
  return `Skill · ${skill}`
}

/**
 * Structured tooltip model for a conversation row.
 * Independent of which subtitle labels are enabled in the list.
 */
export function buildConversationDetailTooltipModel(
  conv: ConversationDetailTooltipInput,
): ConversationDetailTooltipModel {
  const title = conv.title.trim() || 'Conversation'
  const rows: ConversationDetailTooltipRow[] = [
    { label: 'Session', value: sessionTypeLabel(conv.type) },
    { label: 'Agent', value: conv.agentName.trim() || 'Agent' },
  ]
  const agentType = conv.agentType?.trim()
  if (agentType) rows.push({ label: 'Type', value: agentType })
  rows.push({
    label: 'Updated',
    value: formatConversationListDate(conv.updatedAt),
  })
  const workspace = conv.workspacePath?.trim()
  if (workspace) rows.push({ label: 'Workspace', value: workspace })
  if (typeof conv.messageCount === 'number' && conv.messageCount > 0) {
    rows.push({ label: 'Messages', value: String(conv.messageCount) })
  }
  return { title, rows }
}

/** Plain-text fallback of {@link buildConversationDetailTooltipModel}. */
export function buildConversationDetailTooltip(
  conv: ConversationDetailTooltipInput,
): string {
  const model = buildConversationDetailTooltipModel(conv)
  return [
    model.title,
    ...model.rows.map((row) => `${row.label}: ${row.value}`),
  ].join('\n')
}
