/**
 * Suggested follow-up actions for a conversation turn.
 *
 * Persisted at `<conversation-sandbox>/followup/meta.json` whenever the agent
 * (or UI) wants to offer next-step chips after a reply.
 *
 * Each item has:
 * - `label` — human explanation of the suggested next step
 * - `action` — either send a user message (`user_input`) or invoke a tool (`tool_call`)
 */

export const FOLLOWUP_DIR = 'followup'
export const FOLLOWUP_META_FILENAME = 'meta.json'
/** Sandbox-relative path for the conversation follow-up catalog. */
export const FOLLOWUP_META_REL_PATH = `${FOLLOWUP_DIR}/${FOLLOWUP_META_FILENAME}`

export const FOLLOWUP_META_VERSION = 1 as const

export const FOLLOWUP_ACTION_TYPES = ['user_input', 'tool_call'] as const
export type FollowUpActionType = (typeof FOLLOWUP_ACTION_TYPES)[number]

/** Send this text as the next user message / command. */
export type FollowUpUserInputAction = {
  type: 'user_input'
  message: string
}

/** Invoke a named skill/tool with optional JSON args. */
export type FollowUpToolCallAction = {
  type: 'tool_call'
  tool: string
  args?: Record<string, unknown>
}

export type FollowUpAction = FollowUpUserInputAction | FollowUpToolCallAction

export type FollowUpItem = {
  /** Stable id for edit/remove and UI selection. */
  id: string
  /** Short explanation of the suggested next step. */
  label: string
  /** What to run when the user picks this suggestion. */
  action: FollowUpAction
  /** Lower numbers sort first when present. */
  priority?: number
}

export type FollowUpSource = {
  /** User message (or summary) that motivated these suggestions. */
  userMessage?: string
  /** Assistant turn id that produced the reply these follow-ups attach to. */
  assistantMessageId?: string
}

/**
 * Root document written to `followup/meta.json`.
 * Always a catalog: `followUps` is an ordered JSON array of items.
 */
export type FollowUpMeta = {
  version: typeof FOLLOWUP_META_VERSION
  conversationId: string
  updatedAt: string
  /**
   * Monotonic catalog revision for clear/write/notify race handling.
   * Higher revision always wins in the renderer.
   */
  revision?: number
  source?: FollowUpSource
  followUps: FollowUpItem[]
}

/** Tool / API input before ids are assigned. */
export type FollowUpItemInput = {
  id?: string
  label: string
  action: FollowUpAction
  priority?: number
}

export type GenerateFollowUpMode = 'replace' | 'append'

export function emptyFollowUpMeta(conversationId: string): FollowUpMeta {
  return {
    version: FOLLOWUP_META_VERSION,
    conversationId,
    updatedAt: new Date().toISOString(),
    followUps: [],
  }
}

function newFollowUpId(): string {
  return `fu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseFollowUpAction(raw: unknown): FollowUpAction | null {
  if (!isPlainObject(raw)) return null
  const type = String(raw.type ?? '').trim()
  if (type === 'user_input') {
    const message = typeof raw.message === 'string' ? raw.message.trim() : ''
    if (!message) return null
    return { type: 'user_input', message }
  }
  if (type === 'tool_call') {
    const tool = typeof raw.tool === 'string' ? raw.tool.trim() : ''
    if (!tool) return null
    const args = isPlainObject(raw.args) ? raw.args : undefined
    return args ? { type: 'tool_call', tool, args } : { type: 'tool_call', tool }
  }
  return null
}

export function parseFollowUpItem(raw: unknown): FollowUpItem | null {
  if (!isPlainObject(raw)) return null
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  if (!label) return null
  const action = parseFollowUpAction(raw.action)
  if (!action) return null
  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : newFollowUpId()
  const priority =
    typeof raw.priority === 'number' && Number.isFinite(raw.priority)
      ? Math.trunc(raw.priority)
      : undefined
  return {
    id,
    label,
    action,
    ...(priority !== undefined ? { priority } : {}),
  }
}

export function parseFollowUpMeta(raw: unknown): FollowUpMeta | null {
  if (!isPlainObject(raw)) return null
  const conversationId =
    typeof raw.conversationId === 'string' ? raw.conversationId.trim() : ''
  if (!conversationId) return null
  const followUpsRaw = Array.isArray(raw.followUps) ? raw.followUps : []
  const followUps: FollowUpItem[] = []
  for (const row of followUpsRaw) {
    const item = parseFollowUpItem(row)
    if (item) followUps.push(item)
  }
  const source = isPlainObject(raw.source)
    ? {
        ...(typeof raw.source.userMessage === 'string' && raw.source.userMessage.trim()
          ? { userMessage: raw.source.userMessage.trim() }
          : {}),
        ...(typeof raw.source.assistantMessageId === 'string' &&
        raw.source.assistantMessageId.trim()
          ? { assistantMessageId: raw.source.assistantMessageId.trim() }
          : {}),
      }
    : undefined
  return {
    version: FOLLOWUP_META_VERSION,
    conversationId,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
        ? raw.updatedAt.trim()
        : new Date().toISOString(),
    ...(typeof raw.revision === 'number' &&
    Number.isFinite(raw.revision) &&
    raw.revision >= 0
      ? { revision: Math.trunc(raw.revision) }
      : {}),
    ...(source && Object.keys(source).length > 0 ? { source } : {}),
    followUps,
  }
}

export function normalizeFollowUpItems(
  inputs: FollowUpItemInput[],
): FollowUpItem[] {
  const out: FollowUpItem[] = []
  for (const input of inputs) {
    const item = parseFollowUpItem(input)
    if (item) out.push(item)
  }
  return out
}

/** Sort by priority ascending (missing priority last), then stable by id. */
export function sortFollowUps(items: FollowUpItem[]): FollowUpItem[] {
  return [...items].sort((a, b) => {
    const ap = a.priority ?? Number.POSITIVE_INFINITY
    const bp = b.priority ?? Number.POSITIVE_INFINITY
    if (ap !== bp) return ap - bp
    return a.id.localeCompare(b.id)
  })
}

/** Text to send as the next user message when a follow-up chip is clicked. */
export function followUpItemToUserMessage(item: FollowUpItem): string {
  if (item.action.type === 'user_input') return item.action.message.trim()
  // tool_call → send the human label as the user prompt (agent can act on it).
  return item.label.trim()
}

/**
 * Build the next meta document.
 * - `replace`: overwrite the list with the new items
 * - `append`: merge by id (new items replace same id; others keep order)
 */
export function buildFollowUpMeta(args: {
  conversationId: string
  items: FollowUpItemInput[]
  mode?: GenerateFollowUpMode
  existing?: FollowUpMeta | null
  source?: FollowUpSource
  revision?: number
}): FollowUpMeta {
  const mode = args.mode ?? 'replace'
  const incoming = normalizeFollowUpItems(args.items)
  let followUps: FollowUpItem[]
  if (mode === 'append' && args.existing?.followUps.length) {
    const byId = new Map(args.existing.followUps.map((f) => [f.id, f]))
    for (const item of incoming) {
      byId.set(item.id, item)
    }
    const mergedIds = new Set(incoming.map((i) => i.id))
    const kept = args.existing.followUps.filter((f) => !mergedIds.has(f.id))
    followUps = sortFollowUps([...kept, ...incoming])
  } else {
    followUps = sortFollowUps(incoming)
  }

  const source = args.source ?? args.existing?.source
  return {
    version: FOLLOWUP_META_VERSION,
    conversationId: args.conversationId,
    updatedAt: new Date().toISOString(),
    ...(typeof args.revision === 'number' ? { revision: args.revision } : {}),
    ...(source ? { source } : {}),
    followUps,
  }
}
