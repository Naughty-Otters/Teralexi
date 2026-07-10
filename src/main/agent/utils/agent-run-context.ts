import { getSystemPropValues } from '@config/system-prop'
import { getConversationStore } from '@main/services/conversation-store'
import { getMcpServerManager } from '@main/services/mcp-server-manager'
import { ConfigContext, type EngineAgent } from '../config/context'
import type { RuntimeToolMeta } from '../types'
import { serializeAssistantMessageForHistory } from './structured-content'
import type { ThreadTag } from '../expr/thread-tagger'
import { detectTopicSwitch } from '../expr/thread-context-builder'
import { appCache } from '@main/cache/app-cache'
import { normalizeLlamaCppBaseURL } from '@shared/agent/llamacpp-url'
import {
  openAiCompatibleProviderConfigKeys,
  OPENAI_COMPATIBLE_PROVIDER_IDS,
  resolveOpenAiCompatibleCredentials,
} from '@shared/agent/llm-provider-registry'
import type { ProviderCredentials } from '../types'
import { resolveMcpServersForAgent } from '@shared/mcp/resolve-mcp-servers-for-agent'
export type AgentRunCredentials = ProviderCredentials

function loadOpenAiCompatibleCredentials(
  propValues: Record<string, string | undefined>,
): ProviderCredentials['openAiCompatible'] {
  const out = {} as ProviderCredentials['openAiCompatible']
  for (const providerId of OPENAI_COMPATIBLE_PROVIDER_IDS) {
    out[providerId] = resolveOpenAiCompatibleCredentials(providerId, propValues)
  }
  return out
}

/**
 * Internal: read credentials from disk with no cache.
 * Used by the cache warmer and as the cache-miss fallback.
 */
export function loadAgentRunCredentialsFromDisk(): AgentRunCredentials {
  const config = new ConfigContext()
  const propValues = getSystemPropValues([
    ...Object.values(ConfigContext.SYSTEM_PROP_KEYS),
    ...openAiCompatibleProviderConfigKeys(),
  ])
  return {
    ollamaBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.ollamaBaseURL] ?? '',
      'http://localhost:11434',
    ),
    llamacppBaseURL: normalizeLlamaCppBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.llamacppBaseURL] ?? '',
    ),
    llamacppApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.llamacppApiKey] ?? '',
    anthropicApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.anthropicApiKey] ?? '',
    anthropicBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.anthropicBaseURL] ?? '',
      'https://api.anthropic.com/v1',
    ),
    openaiApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.openaiApiKey] ?? '',
    openaiBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.openaiBaseURL] ?? '',
      'https://api.openai.com/v1',
    ),
    geminiApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.geminiApiKey] ?? '',
    geminiBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.geminiBaseURL] ?? '',
      'https://generativelanguage.googleapis.com/v1beta',
    ),
    deepseekApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.deepseekApiKey] ?? '',
    deepseekApiUrl: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.deepseekApiUrl] ?? '',
      'https://api.deepseek.com/v1',
    ),
    xaiApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.xaiApiKey] ?? '',
    xaiBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.xaiBaseURL] ?? '',
      'https://api.x.ai/v1',
    ),
    zhipuApiKey: propValues[ConfigContext.SYSTEM_PROP_KEYS.zhipuApiKey] ?? '',
    zhipuBaseURL: config.normalizeBaseURL(
      propValues[ConfigContext.SYSTEM_PROP_KEYS.zhipuBaseURL] ?? '',
      'https://api.z.ai/api/paas/v4',
    ),
    openAiCompatible: loadOpenAiCompatibleCredentials(propValues),
  }
}

/**
 * Public API: returns credentials from cache when available, reads disk on miss.
 * Call `appCache.invalidateCredentials()` whenever a provider key is saved.
 */
export function loadAgentRunCredentials(): AgentRunCredentials {
  const cached = appCache.getCredentials()
  if (cached) return cached

  const credentials = loadAgentRunCredentialsFromDisk()
  appCache.setCredentials(credentials)
  return credentials
}

/**
 * Load conversation history for the LLM context.
 *
 * When `currentTag` is provided and a topic switch is detected (the most recent
 * prior user message belongs to a different tag), only messages whose tag matches
 * `currentTag` are included — plus the last `recentPairsOnSwitch` message-pairs
 * regardless of tag, for minimal continuity.  This prevents the model from seeing
 * completed tasks from other topics and trying to redo them.
 */
export function loadConversationHistory(
  conversationId: string,
  assistantMessageId: string,
  opts?: { currentTag?: ThreadTag; recentPairsOnSwitch?: number },
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const storedMessages = getConversationStore().getMessages(conversationId)
  let relevant = storedMessages.filter((m) => m.id !== assistantMessageId)

  const currentTag = opts?.currentTag
  if (currentTag && currentTag !== 'general') {
    const { switched } = detectTopicSwitch(conversationId, currentTag)
    if (switched) {
      const keepPairs = opts?.recentPairsOnSwitch ?? 2
      const keepCount = keepPairs * 2
      // Keep same-tag messages + the last N messages unconditionally
      const recentIds = new Set(relevant.slice(-keepCount).map((m) => m.id))
      relevant = relevant.filter(
        (m) => (m.threadTag ?? 'general') === currentTag || recentIds.has(m.id),
      )
    }
  }

  return relevant.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: serializeAssistantMessageForHistory(m.content),
  }))
}

/**
 * Internal: fetch MCP tools from live servers with no cache.
 * Used by the cache warmer and as the cache-miss fallback.
 */
export async function loadMcpToolsForAgentFromServers(
  userId: string,
  agent: EngineAgent,
): Promise<RuntimeToolMeta[]> {
  const allMcpServers = getConversationStore().listMcpServers(userId)
  const servers = resolveMcpServersForAgent(
    allMcpServers,
    agent.availableMcpServers,
  )
  const mcpTools: RuntimeToolMeta[] = []

  for (const server of servers) {
    try {
      const tools = await getMcpServerManager().listTools(server)
      for (const tool of tools) {
        mcpTools.push({
          name: tool.name,
          description: tool.description ?? '',
          inputSchema: tool.inputSchema,
          source: 'mcp',
          serverId: server.id,
          toolName: tool.name,
        })
      }
    } catch {
      // Skip unavailable MCP servers
    }
  }

  return mcpTools
}

/**
 * Public API: returns MCP tools from cache when available, fetches live on miss.
 * Call `appCache.invalidateMcpTools(userId)` when MCP server settings change.
 */
export async function loadMcpToolsForAgent(
  userId: string,
  agent: EngineAgent,
): Promise<RuntimeToolMeta[]> {
  const cached = appCache.getMcpTools(userId, agent.id)
  if (cached) return cached

  const tools = await loadMcpToolsForAgentFromServers(userId, agent)
  appCache.setMcpTools(userId, agent.id, tools)
  return tools
}

export function resolveEnabledSkillToolNames(
  agent: EngineAgent,
): string[] | undefined {
  if (agent.availableSetTouched && agent.availableSet != null) {
    return agent.availableSet
  }
  return undefined
}
