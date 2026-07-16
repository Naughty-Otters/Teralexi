import {
  applySubAgentSettingsToExecutionSteps,
  DEFAULT_ALLOW_AS_SUB_AGENT,
  DEFAULT_ALLOW_SUB_AGENTS,
} from '@shared/agent/sub-agent-settings'
import {
  clampTodoMaxRetries,
  clampToolLoopMaxIterations,
  DEFAULT_TODO_MAX_RETRIES,
  DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
} from '@shared/agent/tool-loop'
import { withMandatoryToolsInCatalog } from '@shared/agent/mandatory-tools'
import { reconcileAvailableSetWithCatalog } from '@shared/agent/tool-selection'
import { randomShortUuid } from '@shared/utils/short-uuid'
import type { AgentStoreContext } from './agent-store-context'
import type { AgentPersistenceActions } from './agent-persistence'
import { syncAgentExecutionSteps } from './initial-state'
import type { Agent, ProviderType } from './types'

type AgentColor = Agent['color']

export function createAgentMutationsActions(
  ctx: AgentStoreContext,
  persistence: AgentPersistenceActions,
) {
  const { agents, selectedAgentId } = ctx
  const { persistAgentConfiguration, deletePersistedAgentConfiguration } =
    persistence

  function updateAgentModel(agentId: string, model: string) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (agent) {
      agent.model = model
      void persistAgentConfiguration(agentId)
    }
  }

  function updateAgentName(agentId: string, name: string) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.name = name
    void persistAgentConfiguration(agentId)
  }

  function updateAgentDescription(agentId: string, description: string) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.description = description
    void persistAgentConfiguration(agentId)
  }

  function updateAgentColor(agentId: string, color: AgentColor) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.color = color
    void persistAgentConfiguration(agentId)
  }

  function updateAgentSkillsPrompt(agentId: string, prompt: string) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.skillsPrompt = prompt
    syncAgentExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentAvailableSet(agentId: string, availableSet: string[]) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.availableSet = withMandatoryToolsInCatalog(
      agent.availableSkillTools ?? [],
      [...new Set(availableSet)],
    )
    agent.availableSetTouched = true
    syncAgentExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentAvailableSetTouched(
    agentId: string,
    availableSetTouched: boolean,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.availableSetTouched = availableSetTouched
    if (!availableSetTouched) {
      agent.availableSet = reconcileAvailableSetWithCatalog(
        agent.availableSkillTools ?? [],
        { availableSetTouched: false },
      )
    }
    syncAgentExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentToolNeedsApprovalOverrides(
    agentId: string,
    overrides: Record<string, boolean>,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.toolNeedsApprovalOverrides = { ...overrides }
    void persistAgentConfiguration(agentId)
  }

  function updateAgentAvailableMcpServers(
    agentId: string,
    serverIds: string[] | null,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.availableMcpServers =
      serverIds != null ? [...new Set(serverIds)] : undefined
    void persistAgentConfiguration(agentId)
  }

  function updateAgentToolLoopMaxIterations(
    agentId: string,
    maxIterations: number,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.toolLoopMaxIterations = clampToolLoopMaxIterations(maxIterations)
    syncAgentExecutionSteps(agent)
    applySubAgentSettingsToExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentTodoMaxRetries(agentId: string, maxRetries: number) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.todoMaxRetries = clampTodoMaxRetries(maxRetries)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentAllowAsSubAgent(agentId: string, allow: boolean) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.allowAsSubAgent = allow
    void persistAgentConfiguration(agentId)
  }

  function updateAgentSubAgentDelegation(
    agentId: string,
    allowSubAgents: boolean,
    subAgentIds: string[] | null,
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.allowSubAgents = allowSubAgents
    agent.subAgentIds =
      subAgentIds != null && subAgentIds.length > 0
        ? [...new Set(subAgentIds)]
        : null
    syncAgentExecutionSteps(agent)
    applySubAgentSettingsToExecutionSteps(agent)
    void persistAgentConfiguration(agentId)
  }

  function updateAgentProvider(agentId: string, provider: ProviderType) {
    agents.value = agents.value.map((a) => {
      if (a.id !== agentId) return a
      return { ...a, provider, model: '', defaultProviderOptions: undefined }
    })
    void persistAgentConfiguration(agentId)
  }

  function updateAgentLlmRoutingMode(
    agentId: string,
    llmRoutingMode: 'unified' | 'per_stage',
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.llmRoutingMode = llmRoutingMode
    void persistAgentConfiguration(agentId)
  }

  function updateAgentStageLlm(
    agentId: string,
    stageLlm: Agent['stageLlm'],
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.stageLlm = { ...(stageLlm ?? {}) }
    void persistAgentConfiguration(agentId)
  }

  function updateAgentDefaultProviderOptions(
    agentId: string,
    defaultProviderOptions: Agent['defaultProviderOptions'],
  ) {
    const agent = agents.value.find((a) => a.id === agentId)
    if (!agent) return
    agent.defaultProviderOptions = defaultProviderOptions
      ? { ...defaultProviderOptions }
      : undefined
    void persistAgentConfiguration(agentId)
  }

  function addAgent(data: Omit<Agent, 'id'>) {
    const created: Agent = {
      id: `custom:${randomShortUuid()}`,
      name: data.name.trim(),
      description: data.description,
      model: data.model,
      systemPrompt: data.systemPrompt,
      responseLanguage: data.responseLanguage,
      color: data.color,
      enabled: data.enabled,
      provider: data.provider,
      isSkill: false,
      skillsPrompt: data.skillsPrompt ?? '',
      availableSkillTools: data.availableSkillTools,
      availableSet: data.availableSet,
      availableSetTouched: data.availableSetTouched,
      toolNeedsApprovalOverrides: data.toolNeedsApprovalOverrides ?? {},
      availableMcpServers: data.availableMcpServers,
      toolLoopMaxIterations: clampToolLoopMaxIterations(
        data.toolLoopMaxIterations ?? DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
      ),
      todoMaxRetries: clampTodoMaxRetries(
        data.todoMaxRetries ?? DEFAULT_TODO_MAX_RETRIES,
      ),
      allowAsSubAgent: data.allowAsSubAgent ?? DEFAULT_ALLOW_AS_SUB_AGENT,
      allowSubAgents: data.allowSubAgents ?? DEFAULT_ALLOW_SUB_AGENTS,
      subAgentIds: data.subAgentIds ?? null,
      llmRoutingMode: data.llmRoutingMode ?? 'unified',
      stageLlm: { ...(data.stageLlm ?? {}) },
      defaultProviderOptions: data.defaultProviderOptions
        ? { ...data.defaultProviderOptions }
        : undefined,
      executionSteps: data.executionSteps,
    }

    syncAgentExecutionSteps(created)
    applySubAgentSettingsToExecutionSteps(created)
    agents.value = [created, ...agents.value]
    void persistAgentConfiguration(created.id)
  }

  function removeAgent(agentId: string) {
    const target = agents.value.find((a) => a.id === agentId)
    if (!target) return

    agents.value = agents.value.filter((a) => a.id !== agentId || a.isSkill)
    if (selectedAgentId.value === agentId) selectedAgentId.value = null

    if (!target.isSkill) {
      void deletePersistedAgentConfiguration(agentId)
    }
  }

  function toggleAgentEnabled(agentId: string) {
    const target = agents.value.find((a) => a.id === agentId)
    if (!target) return
    const willBeEnabled = !target.enabled
    agents.value = agents.value.map((a) =>
      a.id === agentId ? { ...a, enabled: willBeEnabled } : a,
    )
    if (!willBeEnabled && selectedAgentId.value === agentId)
      selectedAgentId.value = null
    void persistAgentConfiguration(agentId)
  }

  return {
    updateAgentModel,
    updateAgentName,
    updateAgentDescription,
    updateAgentColor,
    updateAgentSkillsPrompt,
    updateAgentAvailableSet,
    updateAgentAvailableSetTouched,
    updateAgentToolNeedsApprovalOverrides,
    updateAgentAvailableMcpServers,
    updateAgentToolLoopMaxIterations,
    updateAgentTodoMaxRetries,
    updateAgentAllowAsSubAgent,
    updateAgentSubAgentDelegation,
    updateAgentProvider,
    updateAgentLlmRoutingMode,
    updateAgentStageLlm,
    updateAgentDefaultProviderOptions,
    addAgent,
    removeAgent,
    toggleAgentEnabled,
  }
}
