/**
 * CacheWarmer — fills AppCache buckets in the background so agent runs avoid
 * disk/DB cold starts.
 *
 * Called from:
 *  - window-manager during the startup loader window (full warm)
 *  - IPC WarmAgentCache when the user switches agents (agent-scoped refresh)
 *
 * Every operation is fire-and-forget; failures are logged but never thrown.
 */

import { createLogger } from '@main/logger'
import type { EngineAgent } from '@main/agent/config/context'
import { loadEngineAgentsFromDisk } from '@main/agent/config/catalog'
import {
  loadAgentRunCredentialsFromDisk,
  loadMcpToolsForAgentFromServers,
} from '@main/agent/utils/agent-run-context'
import {
  buildMemoryPersonaInstructionBlockFromDisk,
  resolveMemoryAgentId,
} from '@main/agent/memory/memory-persona-injection'
import { appCache } from './app-cache'

const log = createLogger('agent.cache.warmer')

export interface WarmCacheArgs {
  userId: string
  agentId?: string
}

let startupWarmPromise: Promise<void> | null = null

async function resolveAgentsForWarm(userId: string): Promise<EngineAgent[]> {
  const cached = appCache.getAgents(userId)
  if (cached) return cached

  const agents = await loadEngineAgentsFromDisk(userId)
  appCache.setAgents(userId, agents)
  return agents
}

async function warmAgents(userId: string): Promise<void> {
  if (appCache.getAgents(userId)) return
  try {
    const agents = await loadEngineAgentsFromDisk(userId)
    appCache.setAgents(userId, agents)
  } catch (err) {
    log.warn('Cache warm failed: agents', { userId, err })
  }
}

async function warmCredentials(): Promise<void> {
  if (appCache.getCredentials()) return
  try {
    const credentials = loadAgentRunCredentialsFromDisk()
    appCache.setCredentials(credentials)
  } catch (err) {
    log.warn('Cache warm failed: credentials', { err })
  }
}

async function warmMcpTools(userId: string, agentId: string): Promise<void> {
  if (appCache.getMcpTools(userId, agentId)) return
  try {
    const agents = await resolveAgentsForWarm(userId)
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return
    const tools = await loadMcpToolsForAgentFromServers(userId, agent)
    appCache.setMcpTools(userId, agent.id, tools)
  } catch (err) {
    log.warn('Cache warm failed: mcpTools', { userId, agentId, err })
  }
}

async function warmPersona(userId: string, agentId: string): Promise<void> {
  try {
    const agents = await resolveAgentsForWarm(userId)
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return

    const memoryAgentId = resolveMemoryAgentId(agent.id, agent.skillId)
    if (appCache.getPersona(userId, memoryAgentId) !== null) return

    const block = buildMemoryPersonaInstructionBlockFromDisk({
      userId,
      agentId: agent.id,
      skillId: agent.skillId ?? undefined,
    })
    appCache.setPersona(userId, memoryAgentId, block)
  } catch (err) {
    log.warn('Cache warm failed: persona', { userId, agentId, err })
  }
}

async function warmAgentScoped(userId: string, agentId: string): Promise<void> {
  await Promise.allSettled([
    warmMcpTools(userId, agentId),
    warmPersona(userId, agentId),
  ])
}

/**
 * Full startup warm: base buckets + MCP tools and persona for every agent.
 * Safe to call multiple times; concurrent calls share one in-flight promise.
 */
export function warmAppCacheOnStartup(userId: string): Promise<void> {
  if (!startupWarmPromise) {
    startupWarmPromise = (async () => {
      log.info('App cache startup warm start', { userId })

      await Promise.allSettled([warmAgents(userId), warmCredentials()])

      const agents = await resolveAgentsForWarm(userId)
      await Promise.allSettled(
        agents.map((agent) => warmAgentScoped(userId, agent.id)),
      )

      log.info('App cache startup warm complete', {
        ...appCache.stats(),
        agentCount: agents.length,
      })
    })().catch((err) => {
      startupWarmPromise = null
      log.warn('App cache startup warm failed', { userId, err })
      throw err
    })
  }
  return startupWarmPromise
}

/** Used in tests to reset startup dedupe state. */
export function resetStartupWarmForTests(): void {
  startupWarmPromise = null
}

/**
 * Warm cache for a user, optionally scoped to one agent (MCP + persona).
 * Always refreshes base buckets first so agent-scoped warmers see the agent list.
 */
export async function warmAgentCache(args: WarmCacheArgs): Promise<void> {
  const { userId, agentId } = args
  log.info('Cache warm start', { userId, agentId })

  await Promise.allSettled([warmAgents(userId), warmCredentials()])

  if (agentId) {
    await warmAgentScoped(userId, agentId)
  }

  log.info('Cache warm complete', { ...appCache.stats() })
}
