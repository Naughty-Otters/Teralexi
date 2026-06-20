import {
  loadAgentPersonaSnapshot,
  loadPersonaMemorySnapshot,
} from './agent-memory-store'
import type { AgentMemoryPersonaSnapshot } from './types'
import { appCache } from '@main/cache/app-cache'

export const MEMORY_PERSONA_INJECTION_LLM = {
  PREAMBLE:
    'Persisted memory profiles below. Use them to personalize planning and tool use; the current user message always takes precedence.',
  USER_PROFILE_HEADER: '=== USER PROFILE PERSONA ===',
  USER_PROFILE_FOOTER: '=== END USER PROFILE PERSONA ===',
  AGENT_PROFILE_HEADER: '=== AGENT PROFILE PERSONA ===',
  AGENT_PROFILE_FOOTER: '=== END AGENT PROFILE PERSONA ===',
} as const

/** Max summary characters injected per persona section. */
const MEMORY_INJECTION_SUMMARY_CHAR_LIMIT = 1_500

export function resolveMemoryAgentId(
  agentId?: string,
  skillId?: string,
): string | null {
  const id = agentId?.trim() || skillId?.trim()
  return id || null
}

function clip(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}\n…[truncated]`
}

function formatPersonaSectionBody(
  snapshot: AgentMemoryPersonaSnapshot,
): string {
  if (!snapshot.summary.trim()) return ''
  return clip(snapshot.summary, MEMORY_INJECTION_SUMMARY_CHAR_LIMIT)
}

function formatUserProfileSection(snapshot: AgentMemoryPersonaSnapshot): string {
  const body = formatPersonaSectionBody(snapshot)
  if (!body) return ''
  return [
    MEMORY_PERSONA_INJECTION_LLM.USER_PROFILE_HEADER,
    body,
    MEMORY_PERSONA_INJECTION_LLM.USER_PROFILE_FOOTER,
  ].join('\n')
}

function formatAgentProfileSection(snapshot: AgentMemoryPersonaSnapshot): string {
  const body = formatPersonaSectionBody(snapshot)
  if (!body) return ''
  return [
    MEMORY_PERSONA_INJECTION_LLM.AGENT_PROFILE_HEADER,
    body,
    MEMORY_PERSONA_INJECTION_LLM.AGENT_PROFILE_FOOTER,
  ].join('\n')
}

export type MemoryPersonaInjectionParams = {
  userId: string
  agentId?: string
  skillId?: string
}

/**
 * Internal: loads persisted personas from disk and formats the two instruction
 * sections (empty string when none exist).
 * Used by the cache warmer and as the cache-miss fallback.
 */
export function buildMemoryPersonaInstructionBlockFromDisk(
  params: MemoryPersonaInjectionParams,
): string {
  const userId = params.userId?.trim() || 'default'
  const memoryAgentId = resolveMemoryAgentId(params.agentId, params.skillId)

  const userPersona = loadPersonaMemorySnapshot(userId, memoryAgentId ?? undefined)
  const agentPersona = memoryAgentId ? loadAgentPersonaSnapshot(memoryAgentId) : null

  const sections = [
    userPersona ? formatUserProfileSection(userPersona) : '',
    agentPersona ? formatAgentProfileSection(agentPersona) : '',
  ].filter(Boolean)

  if (sections.length === 0) return ''
  return [MEMORY_PERSONA_INJECTION_LLM.PREAMBLE, ...sections].join('\n\n')
}

/**
 * Public API: returns the persona block from cache when available, reads disk on miss.
 * Call `appCache.invalidatePersona(userId, memoryAgentId)` when memory is updated.
 */
export function buildMemoryPersonaInstructionBlock(
  params: MemoryPersonaInjectionParams,
): string {
  const userId = params.userId?.trim() || 'default'
  const memoryAgentId = resolveMemoryAgentId(params.agentId, params.skillId)

  const cached = appCache.getPersona(userId, memoryAgentId)
  if (cached !== null) return cached

  const block = buildMemoryPersonaInstructionBlockFromDisk(params)
  appCache.setPersona(userId, memoryAgentId, block)
  return block
}

export function appendMemoryPersonaToInstructions(
  instructions: string,
  params: MemoryPersonaInjectionParams,
): string {
  const memoryBlock = buildMemoryPersonaInstructionBlock(params)
  if (!memoryBlock) return instructions
  if (!instructions.trim()) return memoryBlock
  return `${instructions.trim()}\n\n${memoryBlock}`
}
