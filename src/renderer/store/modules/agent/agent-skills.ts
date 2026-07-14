import type { SkillTool } from '@main/skills/types'
import {
  applySubAgentSettingsToExecutionSteps,
  resolveAllowAsSubAgent,
  resolveAllowSubAgents,
} from '@shared/agent/sub-agent-settings'
import {
  expandSkillSubAgentAvailableSet,
  mergeSkillSubAgentApprovalOverrides,
} from '@shared/agent/skill-sub-agent-tool-defaults'
import {
  resolveSkillAgentConfiguration,
  skillAgentPromptsNeedSeed,
} from '@shared/agent/skill-prompts'
import {
  DEFAULT_TODO_MAX_RETRIES,
  DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
} from '@shared/agent/tool-loop'
import {
  expandRunScriptApprovalOverrides,
  resolveSkillAvailableSet,
} from '@shared/agent/tool-selection'
import {
  expandSkillWorkspaceAvailableSet,
  mergeSkillWorkspaceApprovalOverrides,
} from '@shared/agent/skill-workspace-tool-defaults'
import type { SkillSystemPropertySpec } from '@shared/skills/skill-system-properties'
import { DEFAULT_USER_ID } from './config'
import type { AgentStoreContext } from './agent-store-context'
import type { AgentPersistenceActions } from './agent-persistence'
import {
  syncAgentExecutionSteps,
  type PersistedAgentConfiguration,
} from './initial-state'
import type {
  Agent,
  AgentExecutionSteps,
  AgentSkillToolMeta,
  ProviderType,
} from './types'

export function loadSkillsFromDisk(
  ctx: AgentStoreContext,
  persistence: AgentPersistenceActions,
): Promise<boolean> {
  const { log, agents, selectedAgentId } = ctx
  const { persistAgentConfiguration } = persistence

  return (async () => {
    const channel = window.ipcRendererChannel?.LoadSkills
    if (!channel?.invoke) return false

    try {
      type SkillAgentPayload = {
      id: string
      name: string
      description: string
      model: string
      systemPrompt: string
      color: string
      enabled: boolean
      provider: string
      isSkill: true
      skillId: string
      allowedTools?: string[]
      actionToolNames?: string[]
      skillGroup?: string
      skillGroupLabel?: string
      skillVariant?: string
      skillVariantLabel?: string
      skillGroupOrder?: number
      skillVariantOrder?: number
      skillGroupPrimary?: boolean
      systemProperties?: SkillSystemPropertySpec[]
      compiledArtifact?: {
        thinking?: { instructions?: string }
        instructions?: { instructions?: string }
        validation?: { rules?: string[] }
      }
      compilationStatus?: 'pending' | 'ready' | 'failed' | 'missing'
      skillsPrompt?: string
      toolLoop?: {
        tools: Array<{
          name: string
          tags?: string[]
          description: string
          inputSchema?: unknown
          os?: SkillTool['os']
          needsApproval?: boolean
        }>
        maxIterations?: number
      }
    } & Omit<Agent, 'executionSteps'> & {
        executionSteps?: AgentExecutionSteps
      }

      const skillAgents = (await channel.invoke()) as SkillAgentPayload[]
      if (!Array.isArray(skillAgents)) return false

      const configChannel = window.ipcRendererChannel?.ListAgentConfigurations
      const storedConfigs = configChannel?.invoke
        ? ((await configChannel.invoke({
            userId: DEFAULT_USER_ID,
          })) as PersistedAgentConfiguration[])
        : []
      const configByAgentId = new Map(
        storedConfigs.map((config) => [config.agentId, config]),
      )
      const previousByAgentId = new Map(
        agents.value.map((agent) => [agent.id, agent]),
      )

      const skillAgentIds = new Set(skillAgents.map((agent) => agent.id))

      const mergedSkillAgents = skillAgents.map((s) => {
        const saved = configByAgentId.get(s.id)
        const previous = previousByAgentId.get(s.id)
        const availableSkillTools =
          (s.executionSteps?.toolLoop?.tools as
            | AgentSkillToolMeta[]
            | undefined) ??
          (s.toolLoop?.tools as AgentSkillToolMeta[] | undefined) ??
          []
        const savedAvailableSetTouched = !!(
          saved?.availableSetTouched ?? previous?.availableSetTouched
        )
        let { availableSet, availableSetTouched } = resolveSkillAvailableSet(
          availableSkillTools,
          {
            skillAllowedTools: s.allowedTools,
            skillActionToolNames: s.actionToolNames,
            savedAvailableSet: saved?.availableSet ?? previous?.availableSet,
            availableSetTouched: savedAvailableSetTouched,
          },
        )
        if (s.skillId && !savedAvailableSetTouched) {
          availableSet = expandSkillWorkspaceAvailableSet(
            s.skillId,
            availableSkillTools,
            availableSet,
          )
        }
        if (!savedAvailableSetTouched) {
          availableSet = expandSkillSubAgentAvailableSet(
            availableSkillTools,
            availableSet,
          )
        }
        const toolNeedsApprovalOverrides = expandRunScriptApprovalOverrides(
          mergeSkillSubAgentApprovalOverrides(
            availableSkillTools,
            availableSet,
            mergeSkillWorkspaceApprovalOverrides(
              s.skillId,
              availableSkillTools,
              availableSet,
              saved?.toolNeedsApprovalOverrides ??
                previous?.toolNeedsApprovalOverrides,
            ),
          ),
        )

        const resolved = resolveSkillAgentConfiguration(
          s,
          saved,
          s.compiledArtifact,
        )

        const merged: Agent = {
          id: s.id,
          name: saved?.name ?? s.name,
          description: saved?.description ?? s.description,
          model: saved?.model ?? s.model,
          systemPrompt: resolved.systemPrompt,
          responseLanguage: s.responseLanguage,
          color: (saved?.color ?? s.color) as Agent['color'],
          enabled: saved?.enabled ?? s.enabled,
          provider: (saved?.provider ?? s.provider) as ProviderType,
          isSkill: true as const,
          skillId: s.skillId,
          skillGroup: s.skillGroup,
          skillGroupLabel: s.skillGroupLabel,
          skillVariant: s.skillVariant,
          skillVariantLabel: s.skillVariantLabel,
          skillGroupOrder: s.skillGroupOrder,
          skillVariantOrder: s.skillVariantOrder,
          skillGroupPrimary: s.skillGroupPrimary,
          systemProperties: s.systemProperties,
          skillsPrompt: resolved.skillsPrompt,
          availableSkillTools,
          availableSet,
          availableSetTouched,
          availableMcpServers:
            saved?.availableMcpServers ??
            previous?.availableMcpServers ??
            undefined,
          toolNeedsApprovalOverrides,
          toolLoopMaxIterations:
            saved?.toolLoopMaxIterations ??
            previous?.toolLoopMaxIterations ??
            s.executionSteps?.toolLoop?.maxIterations ??
            DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
          todoMaxRetries:
            saved?.todoMaxRetries ??
            previous?.todoMaxRetries ??
            DEFAULT_TODO_MAX_RETRIES,
          allowAsSubAgent: resolveAllowAsSubAgent(
            saved?.allowAsSubAgent ?? previous?.allowAsSubAgent,
          ),
          allowSubAgents: resolveAllowSubAgents(
            saved?.allowSubAgents ?? previous?.allowSubAgents,
          ),
          subAgentIds:
            saved?.subAgentIds ??
            previous?.subAgentIds ??
            null,
          llmRoutingMode: saved?.llmRoutingMode ?? previous?.llmRoutingMode ?? 'unified',
          stageLlm: {
            ...(saved?.stageLlm ?? previous?.stageLlm ?? {}),
          },
          defaultProviderOptions:
            saved?.defaultProviderOptions ??
            previous?.defaultProviderOptions,
          executionSteps: s.executionSteps,
          compiledArtifact: s.compiledArtifact,
          compilationStatus: s.compilationStatus,
        }

        syncAgentExecutionSteps(merged)
        applySubAgentSettingsToExecutionSteps(merged)
        return merged
      })

      const customAgents: Agent[] = storedConfigs
        .filter(
          (config) =>
            !skillAgentIds.has(config.agentId) &&
            !config.agentId.startsWith('skill:'),
        )
        .map((config) => {
          const custom: Agent = {
            id: config.agentId,
            name: config.name,
            description: config.description,
            model: config.model,
            systemPrompt: config.systemPrompt,
            color: config.color,
            enabled: config.enabled,
            provider: config.provider,
            isSkill: false,
            skillsPrompt: config.skillsPrompt,
            availableSkillTools: [],
            availableSet: [...(config.availableSet ?? [])],
            availableSetTouched: !!config.availableSetTouched,
            toolNeedsApprovalOverrides: config.toolNeedsApprovalOverrides ?? {},
            availableMcpServers: config.availableMcpServers ?? undefined,
            toolLoopMaxIterations: config.toolLoopMaxIterations,
            todoMaxRetries: config.todoMaxRetries,
            allowAsSubAgent: resolveAllowAsSubAgent(config.allowAsSubAgent),
            allowSubAgents: resolveAllowSubAgents(config.allowSubAgents),
            subAgentIds: config.subAgentIds ?? null,
            llmRoutingMode: config.llmRoutingMode ?? 'unified',
            stageLlm: { ...(config.stageLlm ?? {}) },
            defaultProviderOptions: config.defaultProviderOptions
              ? { ...config.defaultProviderOptions }
              : undefined,
          }
          syncAgentExecutionSteps(custom)
          applySubAgentSettingsToExecutionSteps(custom)
          return custom
        })

      agents.value = [...customAgents, ...mergedSkillAgents]

      if (
        selectedAgentId.value &&
        !agents.value.some((agent) => agent.id === selectedAgentId.value)
      ) {
        selectedAgentId.value = null
      }

      for (const agent of mergedSkillAgents) {
        const skillPayload = skillAgents.find((s) => s.id === agent.id)
        const saved = configByAgentId.get(agent.id)
        if (skillPayload && skillAgentPromptsNeedSeed(saved, skillPayload)) {
          await persistAgentConfiguration(agent.id)
        }
      }
      return agents.value.length > 0
    } catch (err) {
      // IPC unavailable (browser/test) or LoadSkills failed (e.g. skill load error)
      log.warn('loadSkillsFromDisk failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  })()
}
