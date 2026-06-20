/** One persisted chat turn (user or assistant) — stored only under `block/`. */
export type AgentMemoryMessage = {
  role: 'user' | 'assistant'
  id: string
  content: string
  createdAt: string
}

/** Raw user↔assistant exchange after an agent flow run. */
export type AgentMemoryBlock = {
  blockId: string
  agentId: string
  conversationId: string
  userId: string
  recordedAt: string
  messages: AgentMemoryMessage[]
}

/** Compact memory for one conversation (`session/`). */
export type AgentMemorySessionSnapshot = {
  agentId: string
  conversationId: string
  userId: string
  updatedAt: string
  blockCount: number
  lastBlockId: string
  summary: string
  facts: string[]
  openThreads: string[]
}

/**
 * Persona snapshot — per-agent file under `memory/<agentId>/persona/profile.json`,
 * or global user file under `memory/users/<userId>/persona/profile.json`.
 */
export type AgentMemoryPersonaSnapshot = {
  /** Agent that last triggered this write (or last contributing agent for user profile). */
  agentId: string
  userId: string
  updatedAt: string
  blockCount: number
  lastBlockId: string
  lastConversationId: string
  summary: string
  facts: string[]
  userPreferences: string[]
  activeTopics: string[]
}

export type MemoryVectorSourceType =
  | 'user-instruction'
  | 'assistant-summary'
  | 'step-output'
  | 'tool-result-summary'

export type MemoryVectorEmbeddingStatus = 'pending' | 'ready' | 'failed'

export type MemoryVectorRecord = {
  recordId: string
  userId: string
  agentId: string
  conversationId: string
  blockId: string
  messageId: string | null
  sourceType: MemoryVectorSourceType
  textContent: string
  textHash: string
  embeddingStatus: MemoryVectorEmbeddingStatus
  importance: number
  eventAt: string
  createdAt: string
  updatedAt: string
}
