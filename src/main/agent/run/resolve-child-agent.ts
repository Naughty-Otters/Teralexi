import type { FlowStageId } from '../constants/step-ids'
import type { EngineAgent } from '../config/catalog'
import type { AgentFlowContext } from '../context'
import type { StepOutputs } from '../types'
import { ConfigContext } from '../config/context'
import type {
  AgentMessage,
  AgentResponseOpts,
  ProviderType,
} from '../types'
import {
  loadAgentRunCredentials,
  loadMcpToolsForAgent,
  resolveEnabledSkillToolNames,
} from '../utils/agent-run-context'
import { getWorkspacePath } from '../workspace/conversation-workspace'
import {
  mergeContextEnvelopeMessages,
  trimContextMessages,
  type SubAgentContextEnvelope,
} from '@shared/agent/sub-agent-context'
import { resolveAgentIdForAgentSwitch } from '@shared/agent/agent-switch-command'
import {
  parseAgentStageLlmSettings,
  type AgentStageLlmSettings,
} from '@shared/agent/stage-llm-settings'
import { createSubAgentLlmDebugRunId } from '../llm/llm-debug-writer'
import { resolveResponseLanguageForAgent } from '@main/i18n/resolve-response-language'
import { StageModelRegistry } from '../providers/stage-model-registry'
import { mergeSubFlowOutputText } from './sub-flow-output-text'

export { mergeSubFlowOutputText } from './sub-flow-output-text'

export type { SubAgentContextEnvelope }

export type ResolveChildAgentParams = {
  agentId: string
  /** Parent run bridge (conversation, callbacks). LLM provider/model are never taken from here. */
  parentOpts: AgentResponseOpts
  task: string
  contextMessages?: AgentMessage[]
  /** Parent thread when contextMessages omitted (full inheritance). */
  parentCurrentMessages?: AgentMessage[]
  /** Pre-built envelope; overrides parentCurrentMessages / contextMessages when set. */
  contextEnvelope?: SubAgentContextEnvelope
  /** Parent flow context for automatic envelope building. */
  parentContext?: AgentFlowContext
  parentRunId?: string
  rootRunId?: string
  /** Restrict child tool loop to these names; `'all'` keeps catalog defaults. */
  allowedToolNames?: string[] | 'all'
  /** Parent pipeline stage to record when the child pauses for HITL. */
  parentHitlPauseStageId?: FlowStageId
  onChunk?: AgentResponseOpts['onChunk']
  onUIMessageChunk?: AgentResponseOpts['onUIMessageChunk']
  onStepProgress?: AgentResponseOpts['onStepProgress']
  onSubAgentRunEvent?: AgentResponseOpts['onSubAgentRunEvent']
}

export function buildContextEnvelope(
  parentContext: AgentFlowContext,
  args: {
    parentRunId: string
    rootRunId: string
    task: string
    conversationId?: string
    assistantMessageId?: string
  },
): SubAgentContextEnvelope {
  const conversationId =
    args.conversationId?.trim() || parentContext.opts.conversationId
  const workspacePath = conversationId
    ? getWorkspacePath(conversationId) ?? undefined
    : undefined

  return {
    rootRunId: args.rootRunId,
    parentRunId: args.parentRunId,
    conversationId,
    assistantMessageId:
      args.assistantMessageId?.trim() || parentContext.opts.assistantMessageId,
    messages: [...parentContext.currentMessages],
    pipelineMessages: parentContext.buildPipelineContextMessages({
      thinking: true,
      planning: true,
      execution: true,
      orderedExecution: true,
      summary: true,
    }),
    workspacePath: workspacePath ?? undefined,
    delegationTask: args.task.trim(),
  }
}

function resolveSeedMessages(params: ResolveChildAgentParams): AgentMessage[] {
  if (params.contextEnvelope) {
    return trimContextMessages(mergeContextEnvelopeMessages(params.contextEnvelope))
  }
  if (params.contextMessages !== undefined) {
    return trimContextMessages([
      ...params.contextMessages,
      {
        role: 'user',
        content: params.task.trim() || 'Complete the delegated task.',
      },
    ])
  }
  if (params.parentContext && params.parentRunId && params.rootRunId) {
    const envelope = buildContextEnvelope(params.parentContext, {
      parentRunId: params.parentRunId,
      rootRunId: params.rootRunId,
      task: params.task,
      conversationId: params.parentOpts.conversationId,
      assistantMessageId: params.parentOpts.assistantMessageId,
    })
    return trimContextMessages(mergeContextEnvelopeMessages(envelope))
  }
  const thread = params.parentCurrentMessages ?? []
  return trimContextMessages([
    ...thread,
    {
      role: 'user',
      content: params.task.trim() || 'Complete the delegated task.',
    },
  ])
}

/** Resolve catalog ids like `coding` → `skill:coding`. */
export function resolveCatalogAgentId(
  agents: readonly EngineAgent[],
  agentId: string,
): string | null {
  const trimmed = agentId.trim()
  if (!trimmed) return null
  const exact = agents.find((a) => a.id === trimmed)
  if (exact) return exact.id
  return resolveAgentIdForAgentSwitch(agents, trimmed)
}

/** LLM routing for a sub-agent run — always from the target agent catalog record. */
export function resolveChildAgentLlmConfig(agent: EngineAgent): {
  provider: ProviderType
  model: string
  stageLlm: AgentStageLlmSettings
} {
  const provider = agent.provider
  const model = agent.model
  const stageLlm =
    agent.stageLlmSettings ??
    parseAgentStageLlmSettings({
      provider,
      model,
      routingMode: 'unified',
    })
  return { provider, model, stageLlm }
}

export async function resolveEngineAgent(
  userId: string,
  agentId: string,
): Promise<EngineAgent> {
  const agents = await ConfigContext.loadEngineAgents(userId)
  const resolvedId = resolveCatalogAgentId(agents, agentId)
  const agent = resolvedId
    ? agents.find((a) => a.id === resolvedId)
    : undefined
  if (!agent) {
    throw new Error(`Sub-agent not found: ${agentId}`)
  }
  if (agent.allowAsSubAgent === false) {
    throw new Error(`Agent "${agentId}" is not allowed as a sub-agent`)
  }
  return agent
}

export async function buildChildAgentResponseOpts(
  params: ResolveChildAgentParams,
): Promise<{ opts: AgentResponseOpts; model: unknown; agent: EngineAgent }> {
  const { agentId, parentOpts, task } = params
  const seedHistory = resolveSeedMessages(params)
  const agent = await resolveEngineAgent(parentOpts.userId, agentId)
  const { provider, model: childModel, stageLlm } =
    resolveChildAgentLlmConfig(agent)
  const credentials = loadAgentRunCredentials()
  const mcpTools = await loadMcpToolsForAgent(parentOpts.userId, agent)
  let enabledSkillTools = resolveEnabledSkillToolNames(agent)
  if (
    params.allowedToolNames &&
    params.allowedToolNames !== 'all'
  ) {
    const allowed = new Set(params.allowedToolNames)
    enabledSkillTools = enabledSkillTools.filter((name) => allowed.has(name))
  }

  const messages: AgentMessage[] = seedHistory
  const llmDebugRunId = createSubAgentLlmDebugRunId(
    parentOpts.llmDebugRunId,
    agent.id,
    parentOpts.userId,
  )

  const opts: AgentResponseOpts = {
    provider,
    model: childModel,
    stageLlm,
    systemPrompt: agent.systemPrompt,
    responseLanguage: resolveResponseLanguageForAgent(
      agent.responseLanguage ?? parentOpts.responseLanguage,
    ),
    abortSignal: parentOpts.abortSignal,
    llmDebugRunId,
    messages,
    executionSteps: agent.executionSteps,
    toolLoopMaxIterations:
      agent.executionSteps?.toolLoop?.maxIterations ?? agent.toolLoopMaxIterations,
    todoMaxRetries: agent.todoMaxRetries,
    skillId: agent.skillId,
    systemProperties: agent.systemProperties,
    compiledArtifact: agent.compiledArtifact,
    agentId: agent.id,
    availableSet: enabledSkillTools,
    availableSetTouched: !!agent.availableSetTouched,
    toolNeedsApprovalOverrides: agent.toolNeedsApprovalOverrides ?? {},
    mcpTools,
    userId: parentOpts.userId,
    conversationId: parentOpts.conversationId,
    assistantMessageId: parentOpts.assistantMessageId,
    ...credentials,
    onChunk: params.onChunk,
    onUIMessageChunk: params.onUIMessageChunk,
    onStepProgress: params.onStepProgress,
    onSubAgentRunEvent: params.onSubAgentRunEvent ?? parentOpts.onSubAgentRunEvent,
  }

  const stageModels = StageModelRegistry.fromOpts(opts)
  const model = stageModels.getModel('default')
  return { opts, model, agent }
}

export function formatSubFlowStepTitle(agent: EngineAgent): string {
  return `Sub-agent: ${agent.name.trim() || agent.id}`
}

export function subAgentReportPreview(
  stepOutputs: StepOutputs,
  maxLen = 240,
): string {
  const text = mergeSubFlowOutputText(stepOutputs, 'report')
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  return `${trimmed.slice(0, maxLen)}…`
}
