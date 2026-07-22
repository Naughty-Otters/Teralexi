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
import { mergeSubFlowOutputText, resolveSubAgentSummaryText } from './sub-flow-output-text'
import { filterMcpToolsForSubagentAccess } from '@toolSet/sub-agents/subagent-profiles'

export {
  mergeSubFlowOutputText,
  buildSubAgentBrief,
  resolveSubAgentSummaryText,
} from './sub-flow-output-text'

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
  /**
   * Override workspace path for this child (e.g. isolated git worktree).
   * When set, tools bind here instead of the parent conversation workspace.
   */
  workspacePathOverride?: string
  /**
   * When true (default if unset and parent workspace is a git repo), create an
   * isolated git worktree for file-mutating parallel agents.
   */
  isolateGitWorktree?: boolean
  /**
   * When true (default), auto-merge the worktree into the parent checkout after
   * a successful run that touched files. Set false for best-of-N (user picks).
   * Empty worktrees are always discarded automatically.
   */
  autoMergeWorktree?: boolean
  /** Appended to the child catalog system prompt (Cursor-style profile instructions). */
  systemPromptAddendum?: string
  /** Force slim seed context (Explore/Plan profiles). */
  slimContext?: boolean
  /** Restrict MCP tools for Cursor-style Explore/Bash/Browser profiles. */
  mcpAccess?: 'none' | 'browser' | 'all'
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
    workspacePathOverride?: string
    /** Restrict child tools — used to decide slim explore-style seed context. */
    allowedToolNames?: string[] | 'all'
    agentId?: string
    /** Force slim when a Cursor-style Explore/Plan profile is applied. */
    slimContext?: boolean
  },
): SubAgentContextEnvelope {
  const conversationId =
    args.conversationId?.trim() || parentContext.opts.conversationId
  const workspacePath =
    args.workspacePathOverride?.trim() ||
    (conversationId ? getWorkspacePath(conversationId) ?? undefined : undefined)

  const readLedgerPaths = parentContext.toolReadCache?.listReadPaths?.() ?? []
  const slimContext =
    args.slimContext === true ||
    shouldUseSlimSubAgentContext({
      allowedToolNames: args.allowedToolNames,
      agentId: args.agentId,
    })

  return {
    rootRunId: args.rootRunId,
    parentRunId: args.parentRunId,
    conversationId,
    assistantMessageId:
      args.assistantMessageId?.trim() || parentContext.opts.assistantMessageId,
    messages: slimContext ? [] : [...parentContext.currentMessages],
    pipelineMessages: parentContext.buildPipelineContextMessages({
      thinking: true,
      planning: true,
      execution: true,
      orderedExecution: true,
      summary: true,
    }),
    workspacePath: workspacePath ?? undefined,
    delegationTask: args.task.trim(),
    readLedgerPaths: readLedgerPaths.length > 0 ? readLedgerPaths : undefined,
    slimContext: slimContext || undefined,
  }
}

const READ_ONLY_SUBAGENT_TOOLS = new Set([
  'read_file',
  'lsp',
  'shell',
  'web_search',
  'web_scrape',
  'read_todos',
  'update_todos',
])
/** Explore / research children get a slim seed (Cursor-style), not the full parent thread. */
export function shouldUseSlimSubAgentContext(args: {
  allowedToolNames?: string[] | 'all'
  agentId?: string
}): boolean {
  const id = args.agentId?.trim().toLowerCase() ?? ''
  if (
    id.includes('explore') ||
    id.includes('research') ||
    id.includes('architect') ||
    id.includes('bash') ||
    id.includes('browser')
  ) {
    return true
  }
  const allowed = args.allowedToolNames
  if (!Array.isArray(allowed) || allowed.length === 0) return false
  return allowed.every((name) => READ_ONLY_SUBAGENT_TOOLS.has(name))
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
      workspacePathOverride: params.workspacePathOverride,
      allowedToolNames: params.allowedToolNames,
      agentId: params.agentId,
      slimContext: params.slimContext,
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
  let mcpTools = await loadMcpToolsForAgent(parentOpts.userId, agent)
  if (params.mcpAccess && params.mcpAccess !== 'all') {
    mcpTools = filterMcpToolsForSubagentAccess(mcpTools, params.mcpAccess)
  }
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

  const systemPrompt = [agent.systemPrompt?.trim(), params.systemPromptAddendum?.trim()]
    .filter(Boolean)
    .join('\n\n')

  const opts: AgentResponseOpts = {
    provider,
    model: childModel,
    stageLlm,
    systemPrompt,
    responseLanguage: resolveResponseLanguageForAgent(
      agent.responseLanguage ?? parentOpts.responseLanguage,
    ),
    abortSignal: parentOpts.abortSignal,
    llmDebugRunId,
    messages,
    workspacePathOverride: params.workspacePathOverride,
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
    // HITL resume payloads live on the parent turn; children must see them to
    // continue after tool-approval / collect-form responses.
    clientUiMessages: parentOpts.clientUiMessages,
    // Keep child token text off the parent bubble unless explicitly wired.
    onChunk: params.onChunk,
    // Forward Chat UI chunks (tool-approval-request, collect-form, tool parts)
    // so nested HITL is actionable instead of stuck on "Awaiting approval".
    onUIMessageChunk:
      params.onUIMessageChunk ?? parentOpts.onUIMessageChunk,
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
  const text = resolveSubAgentSummaryText(stepOutputs)
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  return `${trimmed.slice(0, maxLen)}…`
}
