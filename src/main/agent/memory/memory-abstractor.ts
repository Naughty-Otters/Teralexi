import { Output } from '@teralexi-ai'
import { z } from 'zod'
import { createLogger } from '@main/logger'
import { ConfigContext } from '../config/context'
import { runLlmObjectWithRetry, type StreamTextParams } from '../providers/stream'
import {
  MEMORY_ABSTRACTOR_MESSAGE_CHAR_LIMIT,
  MEMORY_AGENT_PERSONA_SESSIONS_CHAR_LIMIT,
  MEMORY_FALLBACK_SUMMARY_CHAR_LIMIT,
  MEMORY_PERSONA_SESSION_SUMMARY_CHAR_LIMIT,
  MEMORY_SESSION_ALL_BLOCKS_CHAR_LIMIT,
  MEMORY_USER_PERSONA_AGENTS_CHAR_LIMIT,
  MEMORY_USER_PERSONA_SUMMARY_CHAR_LIMIT,
} from './constants'
import { MEMORY_ABSTRACTOR_LLM } from './llm-constants'
import type {
  AgentMemoryBlock,
  AgentMemoryPersonaSnapshot,
  AgentMemorySessionSnapshot,
} from './types'

const log = createLogger('agent.memory.abstractor')

const sessionAbstractSchema = z.object({
  summary: z.string().describe('Compact session narrative, no fluff'),
  facts: z
    .array(z.string())
    .describe('Durable facts from this conversation'),
  openThreads: z
    .array(z.string())
    .describe('Unresolved questions or follow-ups'),
})

const personaAbstractSchema = z.object({
  summary: z.string().describe('Compact cross-conversation narrative'),
  facts: z.array(z.string()).describe('Durable facts about the user or domain'),
  userPreferences: z
    .array(z.string())
    .describe('Stable preferences or constraints'),
  activeTopics: z.array(z.string()).describe('Ongoing themes across conversations'),
})

type SessionAbstractOutput = z.infer<typeof sessionAbstractSchema>
type PersonaAbstractOutput = z.infer<typeof personaAbstractSchema>

function clip(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n…[truncated]`
}

function blockForPrompt(block: AgentMemoryBlock): string {
  const lines = block.messages.map((m) => {
    const label = m.role === 'user' ? 'User' : 'Assistant'
    return `${label} (${m.id}):\n${clip(m.content, MEMORY_ABSTRACTOR_MESSAGE_CHAR_LIMIT)}`
  })
  return lines.join('\n\n')
}

function mergeUniqueStrings(
  ...groups: Array<string[] | undefined>
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const group of groups) {
    for (const raw of group ?? []) {
      const value = raw.trim()
      if (!value) continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(value)
    }
  }
  return out
}

/** Chronological exchanges for the session abstractor (drops oldest turns if over limit). */
function allBlocksForSessionPrompt(blocks: AgentMemoryBlock[]): string {
  const sorted = [...blocks].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt),
  )
  const sections = sorted.map(
    (block, i) =>
      `### Turn ${i + 1} (${block.recordedAt})\n${blockForPrompt(block)}`,
  )

  const included: string[] = []
  let total = 0
  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i]!
    if (
      total + section.length > MEMORY_SESSION_ALL_BLOCKS_CHAR_LIMIT &&
      included.length > 0
    ) {
      break
    }
    included.unshift(section)
    total += section.length
  }

  const omitted = sections.length - included.length
  const prefix =
    omitted > 0
      ? `_(First ${omitted} turn(s) omitted from prompt due to size; merge with the previous session snapshot hint above.)_\n\n`
      : ''
  return (prefix + included.join('\n\n')).trim()
}

async function runAbstractLlm<T>(params: {
  model: unknown
  system: string
  userContent: string
  schema: z.ZodType<T>
  abortSignal?: AbortSignal
  label: string
  logMeta?: Record<string, unknown>
}): Promise<T | null> {
  const outputSpec = (Output.object as (config: { schema: z.ZodType<T> }) => unknown)({
    schema: params.schema,
  })

  return runLlmObjectWithRetry<T>({
    label: params.label,
    abortSignal: params.abortSignal,
    logMeta: params.logMeta,
    streamParams: {
      model: params.model,
      system: params.system,
      messages: [{ role: 'user', content: params.userContent }],
      output: outputSpec,
      abortSignal: params.abortSignal,
    } as StreamTextParams,
  })
}

function fallbackSessionSnapshot(
  block: AgentMemoryBlock,
  conversationBlocks: AgentMemoryBlock[],
  previous: AgentMemorySessionSnapshot | null,
): AgentMemorySessionSnapshot {
  const blocks =
    conversationBlocks.length > 0 ? conversationBlocks : [block]
  const turnSummaries = blocks.map((b) => {
    const user = b.messages.find((m) => m.role === 'user')
    const assistant = b.messages.find((m) => m.role === 'assistant')
    return [
      user ? `User: ${clip(user.content, 800)}` : '',
      assistant ? `Assistant: ${clip(assistant.content, 800)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })

  const mergedSummary = turnSummaries
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MEMORY_FALLBACK_SUMMARY_CHAR_LIMIT)

  return {
    agentId: block.agentId,
    conversationId: block.conversationId,
    userId: block.userId,
    updatedAt: block.recordedAt,
    blockCount: blocks.length,
    lastBlockId: block.blockId,
    summary: mergedSummary || previous?.summary || '',
    facts: previous?.facts ?? [],
    openThreads: previous?.openThreads ?? [],
  }
}

function sessionsForAgentPersonaPrompt(
  sessions: AgentMemorySessionSnapshot[],
): string {
  const payload = sessions.map((s) => ({
    conversationId: s.conversationId,
    updatedAt: s.updatedAt,
    blockCount: s.blockCount,
    summary: clip(s.summary, MEMORY_PERSONA_SESSION_SUMMARY_CHAR_LIMIT),
    facts: s.facts.slice(0, 20),
    openThreads: s.openThreads.slice(0, 10),
  }))
  let json = JSON.stringify(payload, null, 2)
  if (json.length > MEMORY_AGENT_PERSONA_SESSIONS_CHAR_LIMIT) {
    json = `${json.slice(0, MEMORY_AGENT_PERSONA_SESSIONS_CHAR_LIMIT)}\n…[truncated]`
  }
  return json
}

function agentPersonasForUserPersonaPrompt(
  agentPersonas: AgentMemoryPersonaSnapshot[],
): string {
  const payload = agentPersonas.map((p) => ({
    agentId: p.agentId,
    updatedAt: p.updatedAt,
    summary: clip(p.summary, 1_200),
    facts: p.facts.slice(0, 12),
    userPreferences: p.userPreferences.slice(0, 8),
    activeTopics: p.activeTopics.slice(0, 8),
  }))
  let json = JSON.stringify(payload, null, 2)
  if (json.length > MEMORY_USER_PERSONA_AGENTS_CHAR_LIMIT) {
    json = `${json.slice(0, MEMORY_USER_PERSONA_AGENTS_CHAR_LIMIT)}\n…[truncated]`
  }
  return json
}

function fallbackAgentPersonaSnapshot(
  block: AgentMemoryBlock,
  recentSessions: AgentMemorySessionSnapshot[],
): AgentMemoryPersonaSnapshot {
  const facts = new Set<string>()
  const topics = new Set<string>()
  const prefs = new Set<string>()
  let totalBlocks = 0

  const summaryParts: string[] = []
  for (const s of recentSessions) {
    totalBlocks += s.blockCount
    for (const f of s.facts) facts.add(f)
    for (const t of s.openThreads) topics.add(t)
    summaryParts.push(
      `[conv:${s.conversationId}] ${clip(s.summary, 800)}`,
    )
  }

  const mergedSummary = summaryParts
    .join('\n\n')
    .slice(0, MEMORY_FALLBACK_SUMMARY_CHAR_LIMIT)

  return {
    agentId: block.agentId,
    userId: block.userId,
    updatedAt: block.recordedAt,
    blockCount: totalBlocks || 1,
    lastBlockId: block.blockId,
    lastConversationId: block.conversationId,
    summary: mergedSummary || '',
    facts: [...facts].slice(0, 30),
    userPreferences: [...prefs].slice(0, 15),
    activeTopics: [...topics].slice(0, 15),
  }
}

function fallbackUserPersonaSnapshot(
  block: AgentMemoryBlock,
  agentPersonas: AgentMemoryPersonaSnapshot[],
): AgentMemoryPersonaSnapshot {
  const facts = new Set<string>()
  const prefs = new Set<string>()
  const topics = new Set<string>()
  const summaryParts: string[] = []

  for (const p of agentPersonas) {
    for (const f of p.facts) facts.add(f)
    for (const u of p.userPreferences) prefs.add(u)
    for (const t of p.activeTopics) topics.add(t)
    summaryParts.push(`[${p.agentId}] ${clip(p.summary, 400)}`)
  }

  const mergedSummary = clip(
    summaryParts.join(' '),
    MEMORY_USER_PERSONA_SUMMARY_CHAR_LIMIT,
  )

  return {
    agentId: block.agentId,
    userId: block.userId,
    updatedAt: block.recordedAt,
    blockCount: agentPersonas.reduce((n, p) => n + p.blockCount, 0),
    lastBlockId: block.blockId,
    lastConversationId: block.conversationId,
    summary: mergedSummary || '',
    facts: [...facts].slice(0, 20),
    userPreferences: [...prefs].slice(0, 12),
    activeTopics: [...topics].slice(0, 12),
  }
}

export async function abstractSessionMemory(params: {
  model: unknown
  block: AgentMemoryBlock
  conversationBlocks: AgentMemoryBlock[]
  previous: AgentMemorySessionSnapshot | null
  responseLanguage?: string
  abortSignal?: AbortSignal
}): Promise<AgentMemorySessionSnapshot> {
  const { block, previous } = params
  const conversationBlocks =
    params.conversationBlocks.length > 0
      ? params.conversationBlocks
      : [block]

  const userContent = [
    MEMORY_ABSTRACTOR_LLM.SESSION_USER_PREFIX,
    JSON.stringify(previous ?? {}),
    '',
    MEMORY_ABSTRACTOR_LLM.SESSION_USER_ALL_EXCHANGES,
    allBlocksForSessionPrompt(conversationBlocks),
  ].join('\n')

  try {
    const parsed = await runAbstractLlm({
      model: params.model,
      system: new ConfigContext(() => params.responseLanguage).withResponseLanguageInstruction(
        MEMORY_ABSTRACTOR_LLM.SESSION_SYSTEM,
        params.responseLanguage,
      ),
      userContent,
      schema: sessionAbstractSchema,
      abortSignal: params.abortSignal,
      label: 'memorySessionAbstract',
      logMeta: {
        operation: 'session',
        agentId: block.agentId,
        conversationId: block.conversationId,
        blockId: block.blockId,
        blockCount: conversationBlocks.length,
      },
    })
    if (!parsed?.summary?.trim()) {
      return fallbackSessionSnapshot(block, conversationBlocks, previous)
    }
    return {
      agentId: block.agentId,
      conversationId: block.conversationId,
      userId: block.userId,
      updatedAt: block.recordedAt,
      blockCount: conversationBlocks.length,
      lastBlockId: block.blockId,
      summary: parsed.summary.trim(),
      facts: mergeUniqueStrings(previous?.facts, parsed.facts),
      openThreads: mergeUniqueStrings(previous?.openThreads, parsed.openThreads),
    }
  } catch (err) {
    log.warn('Session memory abstraction failed; using fallback', {
      blockId: block.blockId,
      conversationId: block.conversationId,
      err,
    })
    return fallbackSessionSnapshot(block, conversationBlocks, previous)
  }
}

/** Per-agent persona from the last N session summaries for that agent only. */
export async function abstractAgentPersonaMemory(params: {
  model: unknown
  block: AgentMemoryBlock
  recentSessions: AgentMemorySessionSnapshot[]
  responseLanguage?: string
  abortSignal?: AbortSignal
}): Promise<AgentMemoryPersonaSnapshot> {
  const { block } = params
  const recentSessions =
    params.recentSessions.length > 0
      ? params.recentSessions
      : [
          {
            agentId: block.agentId,
            conversationId: block.conversationId,
            userId: block.userId,
            updatedAt: block.recordedAt,
            blockCount: 1,
            lastBlockId: block.blockId,
            summary: clip(
              block.messages.map((m) => `${m.role}: ${m.content}`).join('\n'),
              MEMORY_PERSONA_SESSION_SUMMARY_CHAR_LIMIT,
            ),
            facts: [],
            openThreads: [],
          },
        ]

  const userContent = [
    MEMORY_ABSTRACTOR_LLM.AGENT_PERSONA_USER_SESSIONS,
    sessionsForAgentPersonaPrompt(recentSessions),
  ].join('\n')

  const totalBlockCount = recentSessions.reduce((n, s) => n + s.blockCount, 0)

  try {
    const parsed = await runAbstractLlm({
      model: params.model,
      system: new ConfigContext(() => params.responseLanguage).withResponseLanguageInstruction(
        MEMORY_ABSTRACTOR_LLM.AGENT_PERSONA_SYSTEM,
        params.responseLanguage,
      ),
      userContent,
      schema: personaAbstractSchema,
      abortSignal: params.abortSignal,
      label: 'memoryAgentPersonaAbstract',
      logMeta: {
        operation: 'agentPersona',
        agentId: block.agentId,
        blockId: block.blockId,
        sessionCount: recentSessions.length,
      },
    })
    if (!parsed?.summary?.trim()) {
      return fallbackAgentPersonaSnapshot(block, recentSessions)
    }
    return {
      agentId: block.agentId,
      userId: block.userId,
      updatedAt: block.recordedAt,
      blockCount: totalBlockCount,
      lastBlockId: block.blockId,
      lastConversationId: block.conversationId,
      summary: parsed.summary.trim(),
      facts: parsed.facts ?? [],
      userPreferences: parsed.userPreferences ?? [],
      activeTopics: parsed.activeTopics ?? [],
    }
  } catch (err) {
    log.warn('Agent persona abstraction failed; using fallback', {
      blockId: block.blockId,
      agentId: block.agentId,
      sessionCount: recentSessions.length,
      err,
    })
    return fallbackAgentPersonaSnapshot(block, recentSessions)
  }
}

/** Global user persona — synthesized only from per-agent persona profiles. */
export async function abstractUserPersonaMemory(params: {
  model: unknown
  block: AgentMemoryBlock
  agentPersonas: AgentMemoryPersonaSnapshot[]
  responseLanguage?: string
  abortSignal?: AbortSignal
}): Promise<AgentMemoryPersonaSnapshot> {
  const { block, agentPersonas } = params

  const userContent = [
    MEMORY_ABSTRACTOR_LLM.USER_PERSONA_AGENT_PROFILES,
    agentPersonasForUserPersonaPrompt(agentPersonas),
  ].join('\n')

  try {
    const parsed = await runAbstractLlm({
      model: params.model,
      system: new ConfigContext(() => params.responseLanguage).withResponseLanguageInstruction(
        MEMORY_ABSTRACTOR_LLM.USER_PERSONA_SYSTEM,
        params.responseLanguage,
      ),
      userContent,
      schema: personaAbstractSchema,
      abortSignal: params.abortSignal,
      label: 'memoryUserPersonaAbstract',
      logMeta: {
        operation: 'userPersona',
        userId: block.userId,
        blockId: block.blockId,
        agentPersonaCount: agentPersonas.length,
      },
    })
    if (!parsed?.summary?.trim()) {
      return fallbackUserPersonaSnapshot(block, agentPersonas)
    }
    const summary = clip(parsed.summary.trim(), MEMORY_USER_PERSONA_SUMMARY_CHAR_LIMIT)
    return {
      agentId: block.agentId,
      userId: block.userId,
      updatedAt: block.recordedAt,
      blockCount: agentPersonas.reduce((n, p) => n + p.blockCount, 0),
      lastBlockId: block.blockId,
      lastConversationId: block.conversationId,
      summary,
      facts: (parsed.facts ?? []).slice(0, 20),
      userPreferences: (parsed.userPreferences ?? []).slice(0, 12),
      activeTopics: (parsed.activeTopics ?? []).slice(0, 12),
    }
  } catch (err) {
    log.warn('User persona abstraction failed; using fallback', {
      blockId: block.blockId,
      agentPersonaCount: agentPersonas.length,
      err,
    })
    return fallbackUserPersonaSnapshot(block, agentPersonas)
  }
}

/** @deprecated Use {@link abstractAgentPersonaMemory}. */
export async function abstractPersonaMemory(params: {
  model: unknown
  block: AgentMemoryBlock
  allSessions: AgentMemorySessionSnapshot[]
  previous?: AgentMemoryPersonaSnapshot | null
  responseLanguage?: string
  abortSignal?: AbortSignal
}): Promise<AgentMemoryPersonaSnapshot> {
  return abstractAgentPersonaMemory({
    model: params.model,
    block: params.block,
    recentSessions: params.allSessions,
    responseLanguage: params.responseLanguage,
    abortSignal: params.abortSignal,
  })
}
