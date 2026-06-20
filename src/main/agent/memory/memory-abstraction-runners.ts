import {
  loadAllAgentPersonaSnapshotsForUser,
  loadAllMemoryBlocksForConversation,
  loadRecentSessionMemorySnapshotsForAgent,
  loadSessionMemorySnapshot,
  persistAgentPersonaSnapshot,
  persistSessionMemorySnapshot,
  persistUserPersonaMemorySnapshot,
  pruneAgentSessionSnapshots,
} from './agent-memory-store'
import {
  abstractAgentPersonaMemory,
  abstractSessionMemory,
  abstractUserPersonaMemory,
} from './memory-abstractor'
import { loadMemoryRetentionSettings } from './memory-retention-settings'
import type { AgentMemoryBlock } from './types'

export type MemoryAbstractionRunParams = {
  block: AgentMemoryBlock
  model: unknown
  responseLanguage?: string
  abortSignal?: AbortSignal
}

export async function abstractSessionForBlock(
  params: MemoryAbstractionRunParams,
): Promise<void> {
  const { block } = params
  const retention = loadMemoryRetentionSettings()
  const previousSession = loadSessionMemorySnapshot(
    block.agentId,
    block.conversationId,
  )
  const conversationBlocks = loadAllMemoryBlocksForConversation(
    block.agentId,
    block.conversationId,
  )
  const session = await abstractSessionMemory({
    model: params.model,
    block,
    conversationBlocks,
    previous: previousSession,
    responseLanguage: params.responseLanguage,
    abortSignal: params.abortSignal,
  })
  persistSessionMemorySnapshot(session)
  pruneAgentSessionSnapshots(block.agentId, retention.sessionsPerAgent)
}

export async function abstractAgentPersonaForBlock(
  params: MemoryAbstractionRunParams,
): Promise<void> {
  const { block } = params
  const retention = loadMemoryRetentionSettings()
  const recentSessionsForAgent = loadRecentSessionMemorySnapshotsForAgent(
    block.agentId,
    retention.sessionsForAgentPersona,
  )
  const agentPersona = await abstractAgentPersonaMemory({
    model: params.model,
    block,
    recentSessions: recentSessionsForAgent,
    responseLanguage: params.responseLanguage,
    abortSignal: params.abortSignal,
  })
  persistAgentPersonaSnapshot(agentPersona)
}

export async function abstractUserPersonaForBlock(
  params: MemoryAbstractionRunParams,
): Promise<void> {
  const { block } = params
  const agentPersonas = loadAllAgentPersonaSnapshotsForUser(block.userId)
  const userPersona = await abstractUserPersonaMemory({
    model: params.model,
    block,
    agentPersonas,
    responseLanguage: params.responseLanguage,
    abortSignal: params.abortSignal,
  })
  persistUserPersonaMemorySnapshot(userPersona)
}
