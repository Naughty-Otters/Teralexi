import { join } from 'node:path'
import { getMcpServerManager } from '@main/services/mcp-server-manager'
import { getConversationStore } from '@main/services/conversation-store'
import { loadSkillActions, loadToolSetTools } from '@main/skills/skills'
import { resolveSkillFolder } from '@main/skills/skill-path'
import type { AgentStepContext } from '../context'
import type { RuntimeToolMeta } from '../types'
import { createLogger } from '@main/logger'
import { Agent } from '@ai-sdk-tools/agents'
import type { LanguageModel, ModelMessage, Tool, ToolSet } from 'ai'
import {
  buildAgentExecutionContext,
  getAgentMemoryConfig,
  persistAgentStreamTurn,
} from '../agent-memory'
import { STEP_ERRORS, STEP_HELPERS_LABELS } from '../constants/pipeline'
import { toolLoopFilesystemScopeFromStepKey } from '../run/flow-scoped-ids'
import { getCurrentAgentRunScope } from '../run/run-scope'
import { getWorkspacePath } from '../workspace/conversation-workspace'
import {
  runWithExclusiveSandboxGlobals,
  type SandboxGlobalsBindings,
} from '../sandbox/sandbox-globals-lock'
import {
  bindSubAgentDelegation,
  clearSubAgentDelegation,
  SUB_AGENT_TOOL_NAMES,
  type SubAgentDelegationContext,
} from '@toolSet/sub-agents'
import { isMandatoryTool } from '@shared/agent/mandatory-tools'
import { PLAN_MODE_ALWAYS_IN_CATALOG_TOOL_NAMES } from '@toolSet/planning'
import { isPlanModeActive } from '../coding/plan-mode-state'
import { resolveAgentToolChoice } from '../providers/tool-choice-policy'
import type { ProviderType } from '../types'
import {
  resolvePlannedTodoItem,
  resolveTodoReferenceScripts,
  sanitizePlanningField,
  type PlanningTodoListSource,
  type PlannedTodoLike,
  type TodoGoalFormatOptions,
} from '../utils/planning-fields'
import { inferReferenceScriptsFromText } from '../utils/agent-parsing'
import { runLoggedToolExecute } from '../expr/tool-call-logging'
import {
  normalizeToolInputForDedupeKey,
  type ToolPathNormalizeContext,
} from '../expr/tool-input-normalize'
import { buildRepeatToolResultStub } from '../expr/repeat-tool-result-stub'
import {
  readFileReasonFromInput,
  stripReadFileReasonFromInput,
} from '../expr/read-file-reason'
export {
  buildAgentModelMessages,
  clientUiMessagesToModelMessages,
  flattenMultipartTextLikeModelMessages,
} from '../utils'

export const stepLog = createLogger('agent.steps')

function stableSortKeysForDedupe(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(stableSortKeysForDedupe)
  const o = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort()) {
    sorted[k] = stableSortKeysForDedupe(o[k])
  }
  return sorted
}

function serializeToolInputForDedupeKey(input: unknown): string {
  try {
    return JSON.stringify(stableSortKeysForDedupe(input))
  } catch {
    return String(input)
  }
}

function toolInputDedupeKey(toolName: string, input: unknown): string {
  return `${toolName}\0${serializeToolInputForDedupeKey(input)}`
}

export type ToolInputDedupeState = {
  inflightByKey: Map<string, Promise<unknown>>
  succeededKeys: Set<string>
}

export function createToolInputDedupeState(): ToolInputDedupeState {
  return {
    inflightByKey: new Map(),
    succeededKeys: new Set(),
  }
}

function toolOutputIsDedupeSuccess(
  toolName: string,
  result: unknown,
): boolean {
  if (result === null || typeof result !== 'object') return false
  const r = result as Record<string, unknown>
  if (toolName === 'read_file') {
    if (typeof r.error === 'string' && r.error) return false
    return (
      typeof r.content === 'string' ||
      r.isDirectory === true ||
      Array.isArray(r.entries)
    )
  }
  return r.success === true
}

export function resolveToolPathNormalizeContextFromRunCtx(
  runCtx?: AgentStepContext,
): ToolPathNormalizeContext {
  const bindings = resolveSandboxGlobalsBindings(runCtx)
  return {
    sandboxRoot: bindings.root,
    workspacePath: bindings.workspacePath,
  }
}

/**
 * For one tool-loop {@link Agent.stream} / `streamText()` run: identical (tool name + normalized
 * input) invocations share a single underlying `execute` and a single HITL approval when
 * `needsApproval` is true — repeats after a successful result skip approval and return the
 * cached outcome (common when `toolChoice: 'required'` keeps the model in a tool loop).
 *
 * Mutates each tool in `toolSet` in place.
 */
export function applyPerStreamToolInputDedupe(
  toolSet: Record<string, any>,
  options?: {
    state?: ToolInputDedupeState
    pathContext?: ToolPathNormalizeContext
  },
): void {
  const inflightByKey =
    options?.state?.inflightByKey ?? new Map<string, Promise<unknown>>()
  const succeededKeys = options?.state?.succeededKeys ?? new Set<string>()
  const pathContext = options?.pathContext

  const keyFor = (toolName: string, input: unknown) => {
    const forKey =
      toolName === 'read_file'
        ? stripReadFileReasonFromInput(input)
        : input
    const normalized = pathContext
      ? normalizeToolInputForDedupeKey(toolName, forKey, pathContext)
      : forKey
    return toolInputDedupeKey(toolName, normalized)
  }

  for (const name of Object.keys(toolSet)) {
    const spec = toolSet[name]
    if (!spec || typeof spec.execute !== 'function') continue

    const origExecute = spec.execute.bind(spec)
    const rawNeedsApproval = spec.needsApproval

    spec.execute = async (input: unknown) => {
      const key = keyFor(name, input)
      const readFileReRead =
        name === 'read_file' && Boolean(readFileReasonFromInput(input))
      if (readFileReRead) {
        succeededKeys.delete(key)
        inflightByKey.delete(key)
      } else if (succeededKeys.has(key)) {
        stepLog.debug('tool dedupe: returning compact repeat stub', {
          toolName: name,
        })
        return buildRepeatToolResultStub(name, input, pathContext)
      }
      const existing = inflightByKey.get(key)
      if (existing !== undefined) {
        stepLog.debug('tool dedupe: reusing in-flight execute', {
          toolName: name,
        })
        return existing
      }

      const run = (async () => {
        try {
          const out = await origExecute(input)
          if (toolOutputIsDedupeSuccess(name, out)) succeededKeys.add(key)
          return out
        } catch (err) {
          inflightByKey.delete(key)
          throw err
        }
      })()

      inflightByKey.set(key, run)
      return run
    }

    if (typeof rawNeedsApproval === 'function') {
      const origNA = rawNeedsApproval.bind(spec)
      spec.needsApproval = async (input: unknown, opts: unknown) => {
        const key = keyFor(name, input)
        if (succeededKeys.has(key)) {
          stepLog.debug(
            'tool dedupe: skipping approval for repeat success input',
            {
              toolName: name,
            },
          )
          return false
        }
        return origNA(input, opts)
      }
    } else if (rawNeedsApproval === true) {
      spec.needsApproval = async (input: unknown) => {
        const key = keyFor(name, input)
        if (succeededKeys.has(key)) {
          stepLog.debug(
            'tool dedupe: skipping approval for repeat success input',
            {
              toolName: name,
            },
          )
          return false
        }
        return true
      }
    }
  }
}

export { savePendingApprovalState } from './pending-state'

import { isAbortError } from '@shared/utils/abort-error'

export { isAbortError }

function resolveSandboxGlobalsBindings(
  runCtx?: AgentStepContext,
): SandboxGlobalsBindings {
  const runScope = getCurrentAgentRunScope()
  const root =
    runCtx?.sandbox.getRoot()?.trim() ?? runScope?.sandboxRoot?.trim()
  const rawScope =
    runScope?.sandboxOutputScope?.trim() ??
    (runCtx?.stepId === 'toolLoop' ? runCtx.stepInstanceKey : undefined)
  const outputScope = rawScope
    ? toolLoopFilesystemScopeFromStepKey(rawScope)
    : undefined
  const conversationId = runCtx?.sandbox.getConversationId()?.trim()
  const workspacePath =
    runScope?.workspacePath?.trim() ||
    (conversationId
      ? (getWorkspacePath(conversationId) ?? undefined)
      : undefined)
  return { root, outputScope, workspacePath, conversationId }
}

function buildSubAgentDelegationFromRunCtx(
  runCtx?: AgentStepContext,
): SubAgentDelegationContext | undefined {
  if (!runCtx) return undefined
  const toolLoop = runCtx.executionSteps?.toolLoop
  const userId = runCtx.opts.userId?.trim()
  const conversationId = runCtx.opts.conversationId?.trim()
  const workspacePath = conversationId
    ? getWorkspacePath(conversationId) ?? undefined
    : undefined
  return {
    parentRun: runCtx.agentRun as SubAgentDelegationContext['parentRun'],
    opts: runCtx.opts as Record<string, unknown>,
    skillId: runCtx.opts.skillId,
    conversationId,
    workspacePath,
    agentId: runCtx.opts.agentId,
    stepId: runCtx.stepId,
    currentMessages: runCtx.currentMessages,
    getLatestUserMessageContent: () => runCtx.getLatestUserMessageContent(),
    allowSubAgents: toolLoop?.allowSubAgents,
    subAgentIds: toolLoop?.subAgentIds,
    resolveSubAgentTargetId: userId
      ? async (agentId: string) => {
          const { resolveEngineAgent } = await import('../run/resolve-child-agent')
          const agent = await resolveEngineAgent(userId, agentId)
          return agent.id
        }
      : undefined,
  }
}

/**
 * Loads and runs the skill/toolSet implementation from the canonical skills
 * tree (`getSkillsDir()`).
 */
export async function callSkillToolDirect(
  skillId: string,
  toolName: string,
  input: unknown,
  runCtx?: AgentStepContext,
): Promise<unknown> {
  const toolInput =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : { input }

  const { runUserHooks } = await import('../hooks/user-hooks')
  const hookResult = await runUserHooks({
    event: 'beforeToolCall',
    conversationId: runCtx?.opts.conversationId,
    toolName,
    toolInput,
    workspacePath: resolveSandboxGlobalsBindings(runCtx).workspacePath,
  })
  if (hookResult.blocked) {
    return { error: hookResult.message ?? 'Blocked by user hook' }
  }

  return runLoggedToolExecute(
    {
      toolName,
      skillId,
      source: 'skill',
      conversationId: runCtx?.opts.conversationId,
      agentId: runCtx?.opts.agentId,
      stepId: runCtx?.stepId,
    },
    toolInput,
    async () => {
      const skillFolder = resolveSkillFolder(skillId)

      let tool: Awaited<ReturnType<typeof loadToolSetTools>>[number] | undefined

      if (skillFolder) {
        const skillTools = await loadSkillActions(skillFolder, [toolName])
        tool = skillTools.find((t) => t.name === toolName)
      }

      if (!tool) {
        const toolSetTools = await loadToolSetTools()
        tool = toolSetTools.find((t) => t.name === toolName)
      }

      if (!tool) {
        throw new Error(
          STEP_ERRORS.TOOL_NOT_FOUND.replace('{toolName}', toolName),
        )
      }

      const runWithDelegation = async () => {
        bindSubAgentDelegation(buildSubAgentDelegationFromRunCtx(runCtx))
        try {
          return await tool!.execute(toolInput)
        } finally {
          clearSubAgentDelegation()
        }
      }

      // Sub-agent tools spawn a nested AgentRun that executes its own tool loop.
      // Holding the exclusive sandbox lock here deadlocks the first child tool call.
      if (SUB_AGENT_TOOL_NAMES.has(toolName)) {
        return runWithDelegation()
      }

      return runWithExclusiveSandboxGlobals(
        () => {
          if (runCtx) {
            const scope =
              runCtx.stepId === 'toolLoop' ? runCtx.stepInstanceKey : undefined
            runCtx.syncSandboxForToolExecution(scope)
          }
          return resolveSandboxGlobalsBindings(runCtx)
        },
        runWithDelegation,
      )
    },
  ).then(async (result) => {
    const { runUserHooks } = await import('../hooks/user-hooks')
    await runUserHooks({
      event: 'afterToolCall',
      conversationId: runCtx?.opts.conversationId,
      toolName,
      toolInput,
      workspacePath: resolveSandboxGlobalsBindings(runCtx).workspacePath,
      toolResult: result,
    })
    return result
  })
}

export async function callMcpToolDirect(
  userId: string,
  serverId: string,
  toolName: string,
  input: unknown,
  runCtx?: AgentStepContext,
): Promise<unknown> {
  return runLoggedToolExecute(
    {
      toolName,
      source: 'mcp',
      conversationId: runCtx?.opts.conversationId,
      agentId: runCtx?.opts.agentId,
      stepId: runCtx?.stepId,
    },
    input,
    async () => {
      const server = getConversationStore().getMcpServer(userId, serverId)
      if (!server) {
        throw new Error(
          STEP_ERRORS.MCP_SERVER_NOT_FOUND.replace('{serverId}', serverId),
        )
      }
      if (!server.enabled) {
        throw new Error(
          STEP_ERRORS.MCP_SERVER_DISABLED.replace('{serverId}', serverId),
        )
      }
      return getMcpServerManager().callTool(server, toolName, input, {
        userId,
        conversationId: runCtx?.opts.conversationId,
      })
    },
  )
}

export function filterToolsByAvailableSet(
  tools: RuntimeToolMeta[],
  availableSet?: string[],
  conversationId?: string,
): RuntimeToolMeta[] {
  if (!Array.isArray(availableSet)) return tools
  const planModeActive = isPlanModeActive(conversationId)
  const allowed = new Set(availableSet)
  return tools.filter(
    (tool) =>
      tool.source === 'mcp' ||
      isMandatoryTool(tool.name) ||
      allowed.has(tool.name) ||
      (planModeActive &&
        PLAN_MODE_ALWAYS_IN_CATALOG_TOOL_NAMES.has(tool.name)),
  )
}

import { serializeAgentRuntimeContext } from '../llm/llm-debug-runtime-context'
import {
  scheduleLlmDebugRequest,
  scheduleLlmDebugResponse,
} from '../llm/llm-debug-writer'
import { runAgentStream } from '../llm/runtime'
import { logLlmError, formatLlmErrorProgressChunk } from '../llm/log-llm-error'
import { validateModelMessagesForLlm } from '../llm/validate-llm-payload'
import type {
  AgentCollectResult,
  AgentStreamCollectSource as LlmAgentStreamCollectSource,
} from '../llm/ui-message-projector'

export type { AgentCollectResult }

/** What {@link collectAgentText} receives from {@link Agent.stream} / `streamText()`. */
export type AgentStreamCollectSource = LlmAgentStreamCollectSource

export type AgentUsageMeta = {
  opts: import('../types').AgentResponseOpts
  providers: import('../providers/context').ProviderContext
  stepId: string | null
  source: string
}

async function persistAgentUsage(
  result: AgentStreamCollectSource,
  usageMeta?: AgentUsageMeta,
): Promise<void> {
  if (!usageMeta) return
  const usage = await usageMeta.providers.readAgentTotalUsage(result)
  usageMeta.providers.recordTokenUsageFromOpts(
    {
      source: usageMeta.source,
      stepId: usageMeta.stepId,
    },
    usage,
  )
}

/**
 * Drains a `streamText` / {@link Agent.stream} result into a single string for downstream
 * verification and history, and reports whether execution stopped on a **pending tool approval**
 * (HITL): the client must respond and send `clientUiMessages` on the next run.
 */
export async function collectAgentText(
  result: AgentStreamCollectSource,
  onChunk: (chunk: string) => void,
  onUIMessageChunk?: (chunk: Record<string, unknown>) => void,
  usageMeta?: AgentUsageMeta,
): Promise<AgentCollectResult> {
  const collected = await runAgentStream({
    result,
    onChunk,
    onUIMessageChunk,
    bus: usageMeta?.opts?.eventBus,
  })
  await persistAgentUsage(result, usageMeta)
  return collected
}

export type CreateAgentParams = {
  name: string
  model: LanguageModel | unknown
  tools: Record<string, Tool> | Record<string, unknown>
  instructions: string
  stopWhen:
    | import('ai').StopCondition<ToolSet>
    | import('ai').StopCondition<ToolSet>[]
  abortSignal?: AbortSignal
  toolChoice?: 'required' | 'auto' | 'none'
  provider?: ProviderType
  modelId?: string
  /** Per-step plan mode refresh (activeTools + injections after enter/exit). */
  prepareStep?: import('ai').PrepareStepFunction
}

/** Builds an {@link Agent} for tool-loop pipeline steps. */
export function createAgent(params: CreateAgentParams): Agent {
  const {
    name,
    model,
    tools,
    instructions,
    stopWhen,
    abortSignal,
    toolChoice = 'auto',
    provider,
    modelId,
    prepareStep,
  } = params
  const effectiveToolChoice = resolveAgentToolChoice(toolChoice, provider, modelId)
  return new Agent({
    name,
    model: model as LanguageModel,
    tools: tools as Record<string, Tool>,
    instructions,
    memory: getAgentMemoryConfig(),
    modelSettings: {
      toolChoice: effectiveToolChoice,
      stopWhen,
      ...(prepareStep ? { prepareStep } : {}),
      ...(abortSignal != null ? { abortSignal } : {}),
    },
  })
}

export type StreamAgentParams = {
  agent: Agent
  messages: ModelMessage[]
  toolRunCtx: AgentStepContext
  onChunk: (chunk: string) => void
  onUIMessageChunk?: (chunk: Record<string, unknown>) => void
  usageMeta?: AgentUsageMeta
  /** Metadata for sandbox LLM debug dumps when enabled. */
  debugCall?: {
    instructions: string
    toolNames: string[]
    label?: string
  }
}

/** Runs {@link Agent.stream} and collects text / HITL approval state. */
export async function streamAgent(
  params: StreamAgentParams,
): Promise<AgentCollectResult> {
  const {
    agent,
    messages,
    toolRunCtx,
    onChunk,
    onUIMessageChunk,
    usageMeta,
    debugCall,
  } = params

  const llmDebugCtx = {
    userId: toolRunCtx.opts.userId,
    conversationId: toolRunCtx.opts.conversationId,
    agentId: toolRunCtx.opts.agentId,
    llmDebugRunId: toolRunCtx.opts.llmDebugRunId,
    stepId: toolRunCtx.stepId,
    runtimeSnapshot: serializeAgentRuntimeContext(toolRunCtx),
    refreshRuntimeSnapshot: () => serializeAgentRuntimeContext(toolRunCtx),
  }
  const debugLabel = debugCall?.label ?? 'agentStream'
  const debugCallId = debugCall
    ? scheduleLlmDebugRequest(llmDebugCtx, {
        ...llmDebugCtx,
        callKind: 'agentStream',
        label: debugLabel,
        model: undefined,
        instructions: debugCall.instructions,
        toolNames: debugCall.toolNames,
        messages,
      })
    : null

  stepLog.debug('Agent.stream starting', {
    stepId: toolRunCtx.stepId,
    conversationId: toolRunCtx.opts.conversationId,
    agentId: toolRunCtx.opts.agentId,
    messageCount: messages.length,
  })

  try {
    validateModelMessagesForLlm(messages, {
      label: 'streamAgent',
      conversationId: toolRunCtx.opts.conversationId,
      stepId: toolRunCtx.stepId,
      agentId: toolRunCtx.opts.agentId,
    })

    const executionContext = await buildAgentExecutionContext(
      toolRunCtx.opts,
      toolRunCtx.stepInstanceKey,
    )

    const result = await agent.stream({
      messages,
      executionContext,
    } as Parameters<Agent['stream']>[0])

    const collected = await collectAgentText(
      result,
      onChunk,
      onUIMessageChunk,
      usageMeta,
    )

    if (!collected.awaitingToolApproval && !collected.text.trim()) {
      stepLog.warn('Agent.stream returned empty text', {
        stepId: toolRunCtx.stepId,
        conversationId: toolRunCtx.opts.conversationId,
        messageCount: messages.length,
      })
    }

    if (!collected.awaitingToolApproval && collected.text.trim()) {
      await persistAgentStreamTurn(
        toolRunCtx.opts,
        messages,
        collected.text,
        toolRunCtx.stepInstanceKey,
      ).catch((err) => {
        stepLog.warn('persistAgentStreamTurn failed', { err })
      })
    }

    if (debugCallId) {
      scheduleLlmDebugResponse(
        llmDebugCtx,
        debugCallId,
        {
          text: collected.text,
          toolCalls: collected.toolCalls,
          instructions: debugCall?.instructions,
          messagesBefore: messages,
          runtimeSnapshotAfter: llmDebugCtx.refreshRuntimeSnapshot?.(),
        },
        { callKind: 'agentStream', label: debugLabel },
      )
    }

    return collected
  } catch (err) {
    logLlmError('Agent.stream failed', err, {
      path: 'streamAgent',
      stepId: toolRunCtx.stepId,
      conversationId: toolRunCtx.opts.conversationId,
      agentId: toolRunCtx.opts.agentId,
      provider: toolRunCtx.opts.provider,
      model: toolRunCtx.opts.model,
      messageCount: messages.length,
    })
    if (!isAbortError(err)) {
      toolRunCtx.emitStepProgress(formatLlmErrorProgressChunk(err, debugLabel))
    }
    throw err
  }
}

/** Step goal for executor/verifier from {@link PlanningResult.todoList} (canonical list row). */
export function buildTodoStepGoalFromPlan(
  plan: PlanningTodoListSource | undefined,
  todoItem: PlannedTodoLike,
  todoIndexInPlan?: number,
): string {
  const planned = resolvePlannedTodoItem(plan, todoItem, todoIndexInPlan)
  return formatTodoGoalForInstructions(planned, {
    finalGoal: plan?.finalGoal,
    todoId: planned.id,
  })
}

function appendTodoReferenceScriptLines(
  lines: string[],
  item: PlannedTodoLike,
): void {
  const explicit = resolveTodoReferenceScripts(undefined, item)
  const scripts =
    explicit.length > 0
      ? explicit
      : inferReferenceScriptsFromText(
          [item.name, item.description, item.success_criteria].join('\n'),
        )
  const formatted = scripts
    .map((s) => {
      const url = (s.reference_url ?? '').trim()
      if (!url) return ''
      const type = (s.script_type ?? 'bash').trim() || 'bash'
      return `[${type}] ${url}`
    })
    .filter(Boolean)
  if (formatted.length > 0) {
    lines.push(
      `${STEP_HELPERS_LABELS.REFERENCE_SCRIPTS} ${formatted.join('; ')}`,
    )
  }
}

export function formatTodoGoalForInstructions(
  item: PlannedTodoLike,
  options?: TodoGoalFormatOptions,
): string {
  const name = sanitizePlanningField(item.name)
  const description = sanitizePlanningField(item.description)
  const success_criteria = sanitizePlanningField(item.success_criteria)

  const lines: string[] = []
  if (name) lines.push(`${STEP_HELPERS_LABELS.TASK} ${name}`)
  if (description)
    lines.push(`${STEP_HELPERS_LABELS.DESCRIPTION} ${description}`)
  if (success_criteria)
    lines.push(`${STEP_HELPERS_LABELS.SUCCESS_CRITERIA} ${success_criteria}`)
  appendTodoReferenceScriptLines(lines, item)

  if (lines.length === 0) {
    const finalGoal = sanitizePlanningField(options?.finalGoal)
    if (finalGoal)
      lines.push(`${STEP_HELPERS_LABELS.OVERALL_GOAL} ${finalGoal}`)
    if (options?.todoId != null)
      lines.push(`${STEP_HELPERS_LABELS.PLAN_STEP} ${options.todoId}`)
  }

  return lines.join('\n') || '(no task details)'
}

/** Post–form-submit step goal: drops planning text about collecting form input. */
export function formatTodoGoalForFormSubmitResume(
  item: PlannedTodoLike,
  options: { mode: 'execute' | 'verify' },
): string {
  const name = sanitizePlanningField(item.name)
  const description =
    options.mode === 'verify'
      ? 'User has already submitted the required form values. Verify execution behavior only.'
      : 'User has already submitted the required form values. Execute this step using those values as tool parameters.'
  const success_criteria =
    'The step executes using submitted form values and returns output. Do not require an additional wait/pause for user input or re-invoke the collect form.'

  const lines: string[] = []
  if (name) lines.push(`${STEP_HELPERS_LABELS.TASK} ${name}`)
  lines.push(`${STEP_HELPERS_LABELS.DESCRIPTION} ${description}`)
  lines.push(`${STEP_HELPERS_LABELS.SUCCESS_CRITERIA} ${success_criteria}`)
  //appendTodoReferenceScriptLines(lines, item)
  return lines.join('\n')
}

export type TodoHitlRoute = 'normal' | 'tool-approval' | 'form-submit'

/**
 * Step goal for executor/verifier prompts.
 * When form field values are already available, rewrite description/criteria so the
 * model does not re-collect via HITL; this is separate from {@link TodoHitlRoute}
 * (UI form-submit resume uses `form-submit` only when the client sent a form response).
 */
export function buildTodoStepGoalForExecution(
  plan: PlanningTodoListSource | undefined,
  todoItem: PlannedTodoLike,
  todoIndexInPlan: number | undefined,
  formValuesCollected: boolean,
): string {
  const planned = resolvePlannedTodoItem(plan, todoItem, todoIndexInPlan)
  if (formValuesCollected) {
    return formatTodoGoalForFormSubmitResume(planned, { mode: 'execute' })
  }
  return formatTodoGoalForInstructions(planned, {
    finalGoal: plan?.finalGoal,
    todoId: planned.id,
  })
}
