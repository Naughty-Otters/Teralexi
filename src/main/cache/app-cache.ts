/**
 * AppCache — global in-process cache for hot-path data.
 *
 * Readers check the cache first; misses fall through to disk/DB.
 * Cache is filled eagerly by the CacheWarmer when the user opens the chat
 * panel or switches to an agent, so by the time the first message fires all
 * data is already in-memory.
 *
 * Invalidation is explicit: every write path (settings save, memory update,
 * MCP change) calls the corresponding `invalidate*` method so the next read
 * gets fresh data.
 *
 * Buckets
 * ───────
 *  agents       userId → EngineAgent[]
 *  credentials  (global, no key) → AgentRunCredentials
 *  mcpTools     `${userId}:${agentId}` → RuntimeToolMeta[]
 *  persona      `${userId}:${memoryAgentId|''}` → persona instruction string
 */

import { createLogger } from '@main/logger'
import type { EngineAgent } from '@main/agent/config/context'
import type { AgentRunCredentials } from '@main/agent/utils/agent-run-context'
import type { RuntimeToolMeta } from '@main/agent/types'

const log = createLogger('agent.cache')

// ─── Bucket types ────────────────────────────────────────────────────────────

type AgentsCacheEntry = { agents: EngineAgent[] }
type CredentialsEntry = { credentials: AgentRunCredentials }
type McpToolsEntry = { tools: RuntimeToolMeta[] }
type PersonaEntry = { block: string }

// ─── Singleton ───────────────────────────────────────────────────────────────

class AppCache {
  private readonly agentsMap = new Map<string, AgentsCacheEntry>()
  private credentialsEntry: CredentialsEntry | null = null
  private readonly mcpToolsMap = new Map<string, McpToolsEntry>()
  private readonly personaMap = new Map<string, PersonaEntry>()

  // ── agents ──────────────────────────────────────────────────────────────

  getAgents(userId: string): EngineAgent[] | null {
    return this.agentsMap.get(userId)?.agents ?? null
  }

  setAgents(userId: string, agents: EngineAgent[]): void {
    this.agentsMap.set(userId, { agents })
    log.debug('Cache set: agents', { userId, count: agents.length })
  }

  invalidateAgents(userId: string): void {
    if (this.agentsMap.delete(userId)) {
      log.debug('Cache invalidated: agents', { userId })
    }
  }

  invalidateAllAgents(): void {
    this.agentsMap.clear()
    log.debug('Cache invalidated: all agents')
  }

  // ── credentials ─────────────────────────────────────────────────────────

  getCredentials(): AgentRunCredentials | null {
    return this.credentialsEntry?.credentials ?? null
  }

  setCredentials(credentials: AgentRunCredentials): void {
    this.credentialsEntry = { credentials }
    log.debug('Cache set: credentials')
  }

  invalidateCredentials(): void {
    if (this.credentialsEntry) {
      this.credentialsEntry = null
      log.debug('Cache invalidated: credentials')
    }
  }

  // ── MCP tools ───────────────────────────────────────────────────────────

  getMcpTools(userId: string, agentId: string): RuntimeToolMeta[] | null {
    return this.mcpToolsMap.get(`${userId}:${agentId}`)?.tools ?? null
  }

  setMcpTools(userId: string, agentId: string, tools: RuntimeToolMeta[]): void {
    this.mcpToolsMap.set(`${userId}:${agentId}`, { tools })
    log.debug('Cache set: mcpTools', { userId, agentId, count: tools.length })
  }

  invalidateMcpTools(userId: string, agentId?: string): void {
    if (agentId) {
      const key = `${userId}:${agentId}`
      if (this.mcpToolsMap.delete(key)) {
        log.debug('Cache invalidated: mcpTools', { userId, agentId })
      }
    } else {
      // Invalidate all MCP tool entries for this user
      for (const key of this.mcpToolsMap.keys()) {
        if (key.startsWith(`${userId}:`)) this.mcpToolsMap.delete(key)
      }
      log.debug('Cache invalidated: all mcpTools', { userId })
    }
  }

  invalidateAllMcpTools(): void {
    this.mcpToolsMap.clear()
    log.debug('Cache invalidated: all mcpTools (global)')
  }

  // ── persona ─────────────────────────────────────────────────────────────

  getPersona(userId: string, memoryAgentId: string | null): string | null {
    return this.personaMap.get(`${userId}:${memoryAgentId ?? ''}`)?.block ?? null
  }

  setPersona(userId: string, memoryAgentId: string | null, block: string): void {
    this.personaMap.set(`${userId}:${memoryAgentId ?? ''}`, { block })
    log.debug('Cache set: persona', { userId, memoryAgentId })
  }

  invalidatePersona(userId: string, memoryAgentId?: string | null): void {
    const key = `${userId}:${memoryAgentId ?? ''}`
    if (this.personaMap.delete(key)) {
      log.debug('Cache invalidated: persona', { userId, memoryAgentId })
    }
  }

  invalidateAllPersona(userId?: string): void {
    if (userId) {
      for (const key of this.personaMap.keys()) {
        if (key.startsWith(`${userId}:`)) this.personaMap.delete(key)
      }
    } else {
      this.personaMap.clear()
    }
    log.debug('Cache invalidated: all persona', { userId })
  }

  // ── diagnostics ─────────────────────────────────────────────────────────

  stats(): Record<string, number> {
    return {
      agents: this.agentsMap.size,
      credentials: this.credentialsEntry ? 1 : 0,
      mcpTools: this.mcpToolsMap.size,
      persona: this.personaMap.size,
    }
  }
}

export const appCache = new AppCache()
