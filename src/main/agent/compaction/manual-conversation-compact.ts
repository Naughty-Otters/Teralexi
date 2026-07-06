import type { ModelMessage } from '@teralexi-ai'
import { ConfigContext } from '../config/context'
import { AgentFlowContext } from '../context'
import { compactConversationIfNeeded } from './context-compaction'
import { ProviderContext } from '../providers/context'
import { loadAgentRunCredentials } from '../utils/agent-run-context'
import { serializeAssistantMessageForHistory } from '../utils/structured-content'
import { getConversationStore } from '@main/services/conversation-store'
import { createLogger } from '@main/logger'
import { resolveResponseLanguageForAgent } from '@main/i18n/resolve-response-language'
import type { AgentResponseOpts } from '../types'

const log = createLogger('agent.compaction.manual')

function storedToModelMessages(
  stored: ReturnType<ReturnType<typeof getConversationStore>['getMessages']>,
): ModelMessage[] {
  return stored.map((m) => ({
    role: m.role,
    content:
      m.role === 'assistant'
        ? serializeAssistantMessageForHistory(m.content)
        : m.content,
  }))
}

function noteContentFromMessage(message: ModelMessage): string {
  return typeof message.content === 'string'
    ? message.content
    : String(message.content ?? '')
}

export type ManualCompactResult =
  | { ok: true; compacted: boolean; message?: string }
  | { ok: false; compacted: false; error: string }

/**
 * Manually compact persisted conversation history (e.g. `/compact` slash command).
 * Replaces older SQLite rows with a single compaction note; recent rounds stay verbatim.
 */
export async function compactStoredConversation(args: {
  conversationId: string
  userId: string
  hint?: string
  preserveRecentRounds?: number
}): Promise<ManualCompactResult> {
  const conversationId = args.conversationId?.trim()
  if (!conversationId) {
    return { ok: false, compacted: false, error: 'conversationId is required' }
  }

  const store = getConversationStore()
  const conv = store.getConversation(conversationId)
  if (!conv) {
    return { ok: false, compacted: false, error: 'Conversation not found' }
  }

  const stored = store.getMessages(conversationId)
  if (stored.length < 2) {
    return {
      ok: true,
      compacted: false,
      message: 'Not enough history to compact',
    }
  }

  const agents = await ConfigContext.loadEngineAgents(args.userId)
  const agent = agents.find((a) => a.id === conv.agentId)
  if (!agent) {
    return { ok: false, compacted: false, error: 'Agent not found' }
  }

  const credentials = loadAgentRunCredentials()
  const opts = {
    provider: agent.provider,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    responseLanguage: resolveResponseLanguageForAgent(agent.responseLanguage),
    messages: [],
    userId: args.userId,
    conversationId,
    agentId: conv.agentId,
    skillId: agent.skillId,
    ...credentials,
  } as AgentResponseOpts

  const model = ProviderContext.createModelForOpts(opts)
  const flow = new AgentFlowContext(opts, model)
  const stepCtx = flow.createStepContext('toolLoop', 'Manual compaction')

  const preserveRecentRounds = args.preserveRecentRounds ?? 3
  const modelMessages = storedToModelMessages(stored)
  const { messages: compacted, compacted: didCompact } =
    await compactConversationIfNeeded(stepCtx, modelMessages, {
      forceCompact: true,
      preserveRecentRounds,
      compactionHint: args.hint,
    })

  if (!didCompact) {
    return {
      ok: true,
      compacted: false,
      message: 'Nothing to compact (history too short or compaction produced no note)',
    }
  }

  const recentCount = compacted.length - 1
  const toKeep = stored.slice(-recentCount)
  const toDelete = stored.slice(0, stored.length - recentCount)
  const noteContent = noteContentFromMessage(compacted[0])

  store.applyCompactionToConversation({
    conversationId,
    agentId: conv.agentId,
    deleteMessageIds: toDelete.map((m) => m.id),
    compactionNote: noteContent,
    anchorCreatedAt: toKeep[0]?.createdAt,
    threadTag: toKeep[0]?.threadTag ?? 'general',
  })

  log.info('Manual conversation compaction applied', {
    conversationId,
    deletedCount: toDelete.length,
    keptCount: toKeep.length,
    hadHint: Boolean(args.hint?.trim()),
  })

  return { ok: true, compacted: true }
}
