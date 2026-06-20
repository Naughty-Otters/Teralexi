import { getConversationStore } from '@main/services/conversation-store'
import {
  extractTrailingUserForPersistence,
  parseClientUiMessages,
  serializeAssistantMessageForHistory,
  type TrailingUserForPersistence,
} from '../utils'
import {
  persistAgentMemoryBlock,
  pruneAgentMemoryBlocks,
} from './agent-memory-store'
import { createLogger } from '@main/logger'
import { getMemoryAbstractionQueue } from './memory-abstraction-queue'
import {
  abstractAgentPersonaForBlock,
  abstractSessionForBlock,
  abstractUserPersonaForBlock,
} from './memory-abstraction-runners'
import { loadMemoryRecordingSettings } from './memory-recording-settings'
import { loadMemoryRetentionSettings } from './memory-retention-settings'
import type { AgentMemoryBlock, AgentMemoryMessage } from './types'
import { persistMemoryVectorRecordsFromBlock } from './vector-memory-store'

const log = createLogger('agent.memory.record-exchange')

export type RecordAgentMemoryExchangeInput = {
  agentId: string
  conversationId: string
  userId: string
  assistantMessageId: string
  assistantContent: string
  model: unknown
  responseLanguage?: string
  abortSignal?: AbortSignal
  uiMessages?: unknown[]
  pendingUserMessage?: {
    id: string
    content: string
    createdAt: string
  }
}

function trailingUserFromPending(
  pending: RecordAgentMemoryExchangeInput['pendingUserMessage'],
): TrailingUserForPersistence | null {
  if (!pending) return null
  const id = pending.id?.trim()
  const content = pending.content?.trim()
  const createdAt = pending.createdAt?.trim()
  if (!id || !content || !createdAt) return null
  return { id, content, createdAt }
}

function resolveUserMessageFromStore(
  conversationId: string,
  assistantMessageId: string,
): AgentMemoryMessage | null {
  const stored = getConversationStore().getMessages(conversationId)
  for (let i = stored.length - 1; i >= 0; i--) {
    const row = stored[i]
    if (row.id === assistantMessageId) continue
    if (row.role !== 'user') continue
    const content = row.content?.trim()
    if (!content) continue
    return {
      role: 'user',
      id: row.id,
      content,
      createdAt: row.createdAt,
    }
  }
  return null
}

function resolveUserMessage(
  input: RecordAgentMemoryExchangeInput,
): AgentMemoryMessage | null {
  const fromUi = extractTrailingUserForPersistence(
    parseClientUiMessages(input.uiMessages),
  )
  const row = fromUi ?? trailingUserFromPending(input.pendingUserMessage)
  if (row) {
    return {
      role: 'user',
      id: row.id,
      content: row.content,
      createdAt: row.createdAt,
    }
  }
  return resolveUserMessageFromStore(
    input.conversationId,
    input.assistantMessageId,
  )
}

function buildBlock(input: RecordAgentMemoryExchangeInput): AgentMemoryBlock | null {
  const assistantContent = input.assistantContent.trim()
  if (!assistantContent) return null

  const user = resolveUserMessage(input)
  const messages: AgentMemoryMessage[] = []
  if (user) messages.push(user)
  messages.push({
    role: 'assistant',
    id: input.assistantMessageId,
    content: serializeAssistantMessageForHistory(assistantContent),
    createdAt: new Date().toISOString(),
  })

  return {
    blockId: `${input.conversationId}_${input.assistantMessageId}`,
    agentId: input.agentId,
    conversationId: input.conversationId,
    userId: input.userId,
    recordedAt: new Date().toISOString(),
    messages,
  }
}

function persistVectorRecordsIfEnabled(block: AgentMemoryBlock): void {
  const recording = loadMemoryRecordingSettings()
  if (!recording.block || !recording.vector) return
  try {
    persistMemoryVectorRecordsFromBlock(block)
  } catch (err) {
    log.warn('Failed to persist memory vector records from block', {
      agentId: block.agentId,
      conversationId: block.conversationId,
      blockId: block.blockId,
      err,
    })
  }
}

function persistBlockIfEnabled(block: AgentMemoryBlock): void {
  const recording = loadMemoryRecordingSettings()
  const retention = loadMemoryRetentionSettings()
  persistAgentMemoryBlock(block)
  pruneAgentMemoryBlocks(block.agentId, retention.blocksPerAgent)
  persistVectorRecordsIfEnabled(block)
}

/**
 * Persists the raw block synchronously and queues LLM abstraction work.
 * Returns immediately; session/persona jobs run with bounded concurrency.
 */
export function enqueueAgentMemoryExchange(
  input: RecordAgentMemoryExchangeInput,
): void {
  const block = buildBlock(input)
  if (!block) return

  const recording = loadMemoryRecordingSettings()
  if (!recording.block && !recording.session && !recording.persona) return

  if (recording.block) {
    persistBlockIfEnabled(block)
  }

  if (!recording.session && !recording.persona) return

  getMemoryAbstractionQueue().enqueueFromExchange({
    block,
    model: input.model,
    responseLanguage: input.responseLanguage,
    session: recording.session,
    persona: recording.persona,
  })
}

/**
 * Records one turn synchronously: raw data in `block/`, then session/persona LLM work.
 * Prefer {@link enqueueAgentMemoryExchange} on the hot chat path.
 */
export async function recordAgentMemoryExchange(
  input: RecordAgentMemoryExchangeInput,
): Promise<void> {
  const block = buildBlock(input)
  if (!block) return

  const recording = loadMemoryRecordingSettings()
  if (!recording.block && !recording.session && !recording.persona) return

  if (recording.block) {
    persistBlockIfEnabled(block)
  }

  const runParams = {
    block,
    model: input.model,
    responseLanguage: input.responseLanguage,
    abortSignal: input.abortSignal,
  }

  if (recording.session) {
    await abstractSessionForBlock(runParams)
  }

  if (recording.persona) {
    await abstractAgentPersonaForBlock(runParams)
    await abstractUserPersonaForBlock(runParams)
  }
}
