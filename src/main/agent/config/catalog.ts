import {
  getConversationStore,
  type StoredAgentConfiguration,
} from '@main/services/conversation-store'
import { appCache } from '@main/cache/app-cache'
import {
  expandRunScriptApprovalOverrides,
  resolveSkillAvailableSet,
} from '@shared/agent/tool-selection'
import {
  expandSkillWorkspaceAvailableSet,
  mergeSkillWorkspaceApprovalOverrides,
} from '@shared/agent/skill-workspace-tool-defaults'
import {
  expandSkillSubAgentAvailableSet,
  mergeSkillSubAgentApprovalOverrides,
} from '@shared/agent/skill-sub-agent-tool-defaults'
import { normalizeExecutionSteps } from '@shared/agent/execution-steps'
import {
  applySubAgentSettingsToExecutionSteps,
  DEFAULT_ALLOW_AS_SUB_AGENT,
  DEFAULT_ALLOW_SUB_AGENTS,
  resolveAllowAsSubAgent,
  resolveAllowSubAgents,
} from '@shared/agent/sub-agent-settings'
import { DEFAULT_TOOL_LOOP_MAX_ITERATIONS, DEFAULT_TODO_MAX_RETRIES } from '@shared/agent/tool-loop'
import { applyCodingDirectToolLoopPolicy } from '@shared/agent/coding-agent-pipeline'
import { resolveSkillAgentConfiguration } from '@shared/agent/skill-prompts'
import type { SkillSystemPropertySpec } from '@shared/skills/skill-system-properties'
import type { SkillCompiledArtifact } from '@main/skills/skill-compiled-schema'
import {
  loadSkills,
  skillToAgent,
} from '@main/skills/skills'
import type { SkillAgent } from '@main/skills/skill-models'
import type { SkillTool } from '@main/skills/types'
import type { AgentExecutionSteps } from '@main/agent/types'
import type { ProviderType } from '@shared/agent/llm-provider-registry'
import {
  parseAgentStageLlmSettings,
  serializeStageLlmOverrides,
  type AgentStageLlmSettings,
} from '@shared/agent/stage-llm-settings'

export type EngineAgent = {
  id: string
  name: string
  description: string
  model: string
  systemPrompt: string
  responseLanguage?: string
  provider: ProviderType
  isSkill: boolean
  skillId?: string
  availableSkillTools: Array<
    Omit<SkillTool, 'execute' | 'inputSchema'> & { inputSchema?: unknown }
  >
  availableSet?: string[]
  availableSetTouched: boolean
  toolNeedsApprovalOverrides: Record<string, boolean>
  availableMcpServers?: string[] | null
  skillsPrompt?: string
  toolLoopMaxIterations?: number
  todoMaxRetries?: number
  executionSteps?: AgentExecutionSteps
  /** When false, other agents cannot delegate to this agent via sub-flow / invoke_agent. */
  allowAsSubAgent?: boolean
  /** When true, tool loop exposes gated `invoke_agent`. */
  allowSubAgents?: boolean
  /** Allow-list for `invoke_agent`; null = any eligible sub-agent. */
  subAgentIds?: string[] | null
  compiledArtifact?: SkillCompiledArtifact
  compilationStatus?: 'pending' | 'ready' | 'failed' | 'missing'
  stageLlmSettings?: AgentStageLlmSettings
  enabled?: boolean
  skillGroup?: string
  skillGroupLabel?: string
  skillVariant?: string
  skillVariantLabel?: string
  skillVariantOrder?: number
  systemProperties?: SkillSystemPropertySpec[]
}

function buildStageLlmSettings(
  provider: string,
  model: string,
  saved?: StoredAgentConfiguration,
): AgentStageLlmSettings {
  return parseAgentStageLlmSettings({
    provider,
    model,
    routingMode: saved?.llmRoutingMode,
    stageLlmJson: saved
      ? serializeStageLlmOverrides(saved.stageLlm)
      : undefined,
  })
}

function mergeSkillAgentWithStoredConfig(
  skillAgent: SkillAgent,
  saved: StoredAgentConfiguration | undefined,
): EngineAgent {
  const availableSkillTools =
    (skillAgent.executionSteps?.toolLoop?.tools as
      | Array<
          Omit<SkillTool, 'execute' | 'inputSchema'> & { inputSchema?: unknown }
        >
      | undefined) ?? []

  let { availableSet, availableSetTouched } = resolveSkillAvailableSet(
    availableSkillTools,
    {
      skillAllowedTools: skillAgent.allowedTools,
      skillActionToolNames: skillAgent.actionToolNames,
      savedAvailableSet: saved?.availableSet,
      availableSetTouched: !!saved?.availableSetTouched,
    },
  )

  if (skillAgent.skillId && !saved?.availableSetTouched) {
    availableSet = expandSkillWorkspaceAvailableSet(
      skillAgent.skillId,
      availableSkillTools,
      availableSet,
    )
  }

  if (!saved?.availableSetTouched) {
    availableSet = expandSkillSubAgentAvailableSet(
      availableSkillTools,
      availableSet,
    )
  }

  const resolved = resolveSkillAgentConfiguration(
    skillAgent,
    saved,
    skillAgent.compiledArtifact,
  )

  const merged: EngineAgent = {
    id: skillAgent.id,
    name: saved?.name ?? skillAgent.name,
    description: saved?.description ?? skillAgent.description,
    model: saved?.model ?? skillAgent.model,
    systemPrompt: resolved.systemPrompt,
    responseLanguage: undefined,
    provider: (saved?.provider ?? skillAgent.provider) as EngineAgent['provider'],
    isSkill: true,
    skillId: skillAgent.skillId,
    availableSkillTools,
    availableSet,
    availableSetTouched,
    toolNeedsApprovalOverrides: expandRunScriptApprovalOverrides(
      mergeSkillSubAgentApprovalOverrides(
        availableSkillTools,
        availableSet,
        mergeSkillWorkspaceApprovalOverrides(
          skillAgent.skillId,
          availableSkillTools,
          availableSet,
          saved?.toolNeedsApprovalOverrides,
        ),
      ),
    ),
    availableMcpServers: saved?.availableMcpServers ?? undefined,
    skillsPrompt: resolved.skillsPrompt,
    toolLoopMaxIterations:
      saved?.toolLoopMaxIterations ??
      skillAgent.executionSteps?.toolLoop?.maxIterations,
    todoMaxRetries: saved?.todoMaxRetries ?? DEFAULT_TODO_MAX_RETRIES,
    executionSteps: skillAgent.executionSteps as AgentExecutionSteps | undefined,
    allowAsSubAgent: resolveAllowAsSubAgent(saved?.allowAsSubAgent),
    allowSubAgents: resolveAllowSubAgents(saved?.allowSubAgents),
    subAgentIds: saved?.subAgentIds ?? null,
    compiledArtifact: skillAgent.compiledArtifact,
    compilationStatus: skillAgent.compilationStatus,
    stageLlmSettings: buildStageLlmSettings(
      (saved?.provider ?? skillAgent.provider) as string,
      saved?.model ?? skillAgent.model,
      saved,
    ),
    enabled: saved?.enabled ?? skillAgent.enabled,
    ...(skillAgent.systemProperties?.length
      ? { systemProperties: [...skillAgent.systemProperties] }
      : {}),
    ...(skillAgent.skillGroup
      ? {
          skillGroup: skillAgent.skillGroup,
          skillGroupLabel: skillAgent.skillGroupLabel,
          skillVariant: skillAgent.skillVariant,
          skillVariantLabel: skillAgent.skillVariantLabel,
          skillVariantOrder: skillAgent.skillVariantOrder,
        }
      : {}),
  }
  merged.executionSteps = normalizeExecutionSteps(merged) as AgentExecutionSteps
  if (skillAgent.compiledArtifact?.thinking.instructions.trim()) {
    merged.executionSteps = {
      ...merged.executionSteps,
      thinking: skillAgent.compiledArtifact.thinking.instructions.trim(),
    }
  }
  applyCodingDirectToolLoopPolicy(merged)
  applySubAgentSettingsToExecutionSteps(merged)
  return merged
}

function storedConfigToCustomAgent(
  config: StoredAgentConfiguration,
): EngineAgent {
  const custom: EngineAgent = {
    id: config.agentId,
    name: config.name,
    description: config.description,
    model: config.model,
    systemPrompt: config.systemPrompt,
    provider: config.provider as EngineAgent['provider'],
    isSkill: false,
    availableSkillTools: [],
    availableSet: [...(config.availableSet ?? [])],
    availableSetTouched: !!config.availableSetTouched,
    toolNeedsApprovalOverrides: config.toolNeedsApprovalOverrides ?? {},
    availableMcpServers: config.availableMcpServers ?? undefined,
    skillsPrompt: config.skillsPrompt,
    toolLoopMaxIterations: config.toolLoopMaxIterations,
    todoMaxRetries: config.todoMaxRetries,
    allowAsSubAgent: resolveAllowAsSubAgent(config.allowAsSubAgent),
    allowSubAgents: resolveAllowSubAgents(config.allowSubAgents),
    subAgentIds: config.subAgentIds ?? null,
    stageLlmSettings: buildStageLlmSettings(
      config.provider,
      config.model,
      config,
    ),
  }
  custom.executionSteps = normalizeExecutionSteps(custom) as AgentExecutionSteps
  applySubAgentSettingsToExecutionSteps(custom)
  return custom
}

/**
 * Internal: load from disk + DB with no cache.
 * Used by the cache warmer and as the cache-miss fallback.
 * Exported so cache-warmer.ts can import it directly without circular deps.
 */
export async function loadEngineAgentsFromDisk(userId: string): Promise<EngineAgent[]> {
  const skills = await loadSkills()
  const skillAgents: SkillAgent[] = skills.map(skillToAgent)

  const storedConfigs = getConversationStore().listAgentConfigurations(userId)
  const configByAgentId = new Map(storedConfigs.map((c) => [c.agentId, c]))
  const skillAgentIds = new Set(skillAgents.map((s) => s.id))

  const store = getConversationStore()
  const mergedSkillAgents = skillAgents.map((skillAgent) => {
    const saved = configByAgentId.get(skillAgent.id)
    const merged = mergeSkillAgentWithStoredConfig(skillAgent, saved)
    if (!saved) {
      store.upsertAgentConfiguration({
        agentId: merged.id,
        userId,
        name: merged.name,
        description: merged.description,
        model: merged.model,
        provider: merged.provider,
        color: skillAgent.color,
        enabled: skillAgent.enabled,
        systemPrompt: merged.systemPrompt,
        skillsPrompt: '',
        availableSet: [...(merged.availableSet ?? [])],
        availableSetTouched: merged.availableSetTouched,
        toolNeedsApprovalOverrides: merged.toolNeedsApprovalOverrides,
        availableMcpServers: merged.availableMcpServers ?? null,
        toolLoopMaxIterations:
          merged.toolLoopMaxIterations ?? DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
        todoMaxRetries: merged.todoMaxRetries ?? DEFAULT_TODO_MAX_RETRIES,
        allowAsSubAgent: merged.allowAsSubAgent ?? DEFAULT_ALLOW_AS_SUB_AGENT,
        allowSubAgents: merged.allowSubAgents ?? DEFAULT_ALLOW_SUB_AGENTS,
        subAgentIds: merged.subAgentIds ?? null,
      })
    }
    return merged
  })

  const customAgents = storedConfigs
    .filter((c) => !skillAgentIds.has(c.agentId))
    .map(storedConfigToCustomAgent)

  return [...customAgents, ...mergedSkillAgents]
}

/**
 * Public API: returns agents from cache when available, loads from disk on miss.
 * Call `appCache.invalidateAgents(userId)` whenever agent config is saved.
 */
export async function loadEngineAgents(userId: string): Promise<EngineAgent[]> {
  const cached = appCache.getAgents(userId)
  if (cached) return cached

  const agents = await loadEngineAgentsFromDisk(userId)
  appCache.setAgents(userId, agents)
  return agents
}

/** Load a skill-backed agent by folder id, including workflow-panel skills hidden from chat. */
export async function loadEngineAgentForSkill(
  userId: string,
  skillFolderId: string,
): Promise<EngineAgent> {
  const skills = await loadSkills()
  const skill = skills.find((s) => s.id === skillFolderId)
  if (!skill) {
    throw new Error(`Skill not found: ${skillFolderId}`)
  }
  const skillAgent = skillToAgent(skill)
  const storedConfigs = getConversationStore().listAgentConfigurations(userId)
  const saved = storedConfigs.find((c) => c.agentId === skillAgent.id)
  return mergeSkillAgentWithStoredConfig(skillAgent, saved)
}
