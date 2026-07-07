import {
  clampTodoMaxRetries,
  clampToolLoopMaxIterations,
  DEFAULT_TODO_MAX_RETRIES,
  DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
} from '@shared/agent/tool-loop'
import {
  applySubAgentSettingsToExecutionSteps,
  DEFAULT_ALLOW_AS_SUB_AGENT,
  DEFAULT_ALLOW_SUB_AGENTS,
} from '@shared/agent/sub-agent-settings'
import { DEFAULT_USER_ID } from './config'
import type { AgentStoreContext } from './agent-store-context'

export function createAgentPersistenceActions(ctx: AgentStoreContext) {
  const { agents, pendingAgentConfigSaves, inFlightWaiters } = ctx

  async function persistAgentConfiguration(agentId: string): Promise<void> {
    const previous = pendingAgentConfigSaves.get(agentId) ?? Promise.resolve()
    const next = previous
      .catch(() => {
        // Keep queue alive even if a previous save failed.
      })
      .then(async () => {
        const channel = window.ipcRendererChannel?.UpsertAgentConfiguration
        if (!channel?.invoke) return

        const agent = agents.value.find((item) => item.id === agentId)
        if (!agent) return

        await channel.invoke({
          agentId: agent.id,
          userId: DEFAULT_USER_ID,
          name: agent.name,
          description: agent.description,
          model: agent.model,
          provider: agent.provider,
          color: agent.color,
          enabled: agent.enabled,
          systemPrompt: '',
          skillsPrompt: agent.skillsPrompt ?? '',
          availableSet: [...(agent.availableSet ?? [])],
          availableSetTouched: !!agent.availableSetTouched,
          toolNeedsApprovalOverrides: {
            ...(agent.toolNeedsApprovalOverrides ?? {}),
          },
          availableMcpServers: agent.availableMcpServers ?? null,
          toolLoopMaxIterations: clampToolLoopMaxIterations(
            agent.toolLoopMaxIterations ??
              agent.executionSteps?.toolLoop?.maxIterations ??
              DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
          ),
          todoMaxRetries: clampTodoMaxRetries(
            agent.todoMaxRetries ?? DEFAULT_TODO_MAX_RETRIES,
          ),
          allowAsSubAgent: agent.allowAsSubAgent ?? DEFAULT_ALLOW_AS_SUB_AGENT,
          allowSubAgents: agent.allowSubAgents ?? DEFAULT_ALLOW_SUB_AGENTS,
          subAgentIds:
            agent.subAgentIds != null && agent.subAgentIds.length > 0
              ? [...agent.subAgentIds]
              : null,
          llmRoutingMode: agent.llmRoutingMode ?? 'unified',
          stageLlm: { ...(agent.stageLlm ?? {}) },
        })
      })

    pendingAgentConfigSaves.set(agentId, next)
    try {
      await next
    } finally {
      if (pendingAgentConfigSaves.get(agentId) === next) {
        pendingAgentConfigSaves.delete(agentId)
      }
    }
  }

  async function waitForPendingAgentConfigurationSave(
    agentId: string,
  ): Promise<void> {
    const pending = pendingAgentConfigSaves.get(agentId)
    if (!pending) return
    await pending.catch(() => {
      // Do not block message sending when settings persistence fails.
    })
  }

  async function deletePersistedAgentConfiguration(
    agentId: string,
  ): Promise<void> {
    const channel = window.ipcRendererChannel?.DeleteAgentConfiguration
    if (!channel?.invoke) return

    await channel.invoke({
      agentId,
      userId: DEFAULT_USER_ID,
    })
  }

  function waitForConversationRun(conversationId: string): Promise<void> {
    return new Promise((resolve) => {
      const waiters = inFlightWaiters.get(conversationId) ?? []
      waiters.push(resolve)
      inFlightWaiters.set(conversationId, waiters)
    })
  }

  function notifyNextConversationWaiter(conversationId: string): void {
    const waiters = inFlightWaiters.get(conversationId)
    if (!waiters || waiters.length === 0) return

    const next = waiters.shift()
    if (waiters.length === 0) inFlightWaiters.delete(conversationId)
    else inFlightWaiters.set(conversationId, waiters)

    next?.()
  }

  return {
    persistAgentConfiguration,
    waitForPendingAgentConfigurationSave,
    deletePersistedAgentConfiguration,
    waitForConversationRun,
    notifyNextConversationWaiter,
  }
}

export type AgentPersistenceActions = ReturnType<
  typeof createAgentPersistenceActions
>
