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

const log = createLogger('agent.compaction.auto')

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

/**
 * When persisted history reaches the configured context window, compact older
 * turns into a single note and keep the newest `budget - 1` messages verbatim.
 */
export async function autoCompactStoredConversationIfNeeded(args: {
  conversationId: string
  userId: string
  messageBudget: number
}): Promise<{ compacted: boolean }> {
  const conversationId = args.conversationId?.trim()
  const messageBudget = Math.max(2, Math.round(args.messageBudget))
  if (!conversationId) return { compacted: false }

  const store = getConversationStore()
  const conv = store.getConversation(conversationId)
  if (!conv) return { compacted: false }

  const stored = store.getMessages(conversationId)
  if (stored.length < messageBudget) return { compacted: false }

  const agents = await ConfigContext.loadEngineAgents(args.userId)
  const agent = agents.find((a) => a.id === conv.agentId)
  if (!agent) return { compacted: false }

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
  const stepCtx = flow.createStepContext('toolLoop', 'Auto compaction')

  const modelMessages = storedToModelMessages(stored)
  const { messages: compacted, compacted: didCompact } =
    await compactConversationIfNeeded(stepCtx, modelMessages, {
      messageBudget,
      forceCompact: true,
    })

  if (!didCompact) return { compacted: false }

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

  log.info('Auto conversation compaction applied', {
    conversationId,
    messageBudget,
    deletedCount: toDelete.length,
    keptCount: toKeep.length,
  })

  return { compacted: true }
}
