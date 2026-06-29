/** Stable session id for one channel sender thread. */
export function buildChannelSessionId(
  channelId: string,
  senderId: string,
): string {
  const channel = channelId.trim()
  const sender = senderId.trim()
  return `channel:${channel}:${sender}`
}

/** Stable session id for a scheduled run-agent job. */
export function buildSchedulerSessionId(schedulerId: string): string {
  return `scheduler:${schedulerId.trim()}`
}

export function resolveSchedulerSessionId(schedule: {
  id: string
  conversationId?: string | null
}): string {
  const explicit = schedule.conversationId?.trim()
  if (explicit) return explicit
  return buildSchedulerSessionId(schedule.id)
}

export type ConversationSessionKind = 'ui' | 'channel' | 'scheduler'

export function classifyConversationSessionId(
  conversationId: string,
): ConversationSessionKind {
  const id = conversationId.trim()
  if (!id) return 'ui'
  if (id.startsWith('channel:')) return 'channel'
  if (id.startsWith('scheduler:')) return 'scheduler'
  // Legacy channel threads keyed by WhatsApp JID only.
  if (id.includes('@s.whatsapp.net') || id.includes('@g.us')) return 'channel'
  return 'ui'
}

export function isBoundSessionId(conversationId: string): boolean {
  return classifyConversationSessionId(conversationId) !== 'ui'
}

/** UI may delete chat and channel threads; scheduler sessions stay bound to jobs. */
export function canDeleteConversationFromUi(conversationId: string): boolean {
  return classifyConversationSessionId(conversationId) !== 'scheduler'
}

export function resolveChannelSessionId(args: {
  channelId: string
  senderId: string
  lookupConversation: (conversationId: string) => unknown | null
}): string {
  const canonical = buildChannelSessionId(args.channelId, args.senderId)
  if (args.lookupConversation(canonical)) return canonical

  const legacy = args.senderId.trim()
  if (legacy && legacy !== canonical && args.lookupConversation(legacy)) {
    return legacy
  }

  return canonical
}
