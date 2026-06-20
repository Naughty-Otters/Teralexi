import type { AgentStepContext } from '../context'
import { getCurrentAgentRunScope } from '../run/run-scope'
import type { StepOutputs } from '../types'

export type LlmDebugClassSnapshot = {
  className: string
  [key: string]: unknown
}

export type LlmDebugRuntimeSnapshot = {
  capturedAt: string
  classes: {
    AgentStepContext?: LlmDebugClassSnapshot
    AgentFlowContext?: LlmDebugClassSnapshot
    AgentResponseOpts?: LlmDebugClassSnapshot
    AgentRun?: LlmDebugClassSnapshot
    AgentRunScope?: LlmDebugClassSnapshot
    ConfigContext?: LlmDebugClassSnapshot
    ProviderContext?: LlmDebugClassSnapshot
    SandboxContext?: LlmDebugClassSnapshot
    FormContext?: LlmDebugClassSnapshot
    ReferenceContext?: LlmDebugClassSnapshot
    StepOutputStore?: LlmDebugClassSnapshot
  }
}

function summarizeStepOutputs(outputs: StepOutputs): Record<string, unknown> {
  const summary: Record<string, unknown> = {}
  if (outputs.thinking) {
    summary.thinking = {
      execution_mode: outputs.thinking.execution_mode,
      goal: truncate(outputs.thinking.goal, 200),
      task: truncate(outputs.thinking.task, 200),
      rawLength: outputs.thinking.raw?.length ?? 0,
    }
  }
  if (outputs.planning) {
    summary.planning = {
      finalGoal: truncate(outputs.planning.finalGoal, 200),
      todoCount: outputs.planning.todoList?.length ?? 0,
      expectationCount: outputs.planning.expectations?.length ?? 0,
    }
  }
  if (outputs.skills) {
    summary.skills = { textLength: outputs.skills.length }
  }
  if (outputs.toolLoop) {
    summary.toolLoop = { textLength: outputs.toolLoop.length }
  }
  if (outputs.summary) {
    summary.summary = {
      goalAchieved: outputs.summary.goalAchieved,
      summaryLength: outputs.summary.summary?.length ?? 0,
    }
  }
  if (outputs.report) {
    summary.report = { textLength: outputs.report.length }
  }
  if (outputs.prompt) {
    summary.prompt = { textLength: outputs.prompt.length }
  }
  return summary
}

function cloneMessages(messages: unknown[]): unknown[] {
  try {
    return structuredClone(messages)
  } catch {
    return JSON.parse(JSON.stringify(messages)) as unknown[]
  }
}

function truncate(value: string | undefined, max: number): string | undefined {
  const v = value?.trim()
  if (!v) return undefined
  return v.length <= max ? v : `${v.slice(0, max)}…`
}

function serializeModel(model: unknown): string | undefined {
  if (model == null) return undefined
  if (typeof model === 'string') return model
  if (typeof model === 'object') {
    const m = model as { modelId?: unknown; provider?: unknown }
    if (m.modelId != null) return String(m.modelId)
  }
  return String(model)
}

/** Snapshot AgentStepContext, AgentFlowContext, and nested context classes for LLM debug dumps. */
export function serializeAgentRuntimeContext(
  stepCtx: AgentStepContext,
): LlmDebugRuntimeSnapshot {
  const flow = stepCtx.agentFlow
  const opts = stepCtx.opts
  const scope = getCurrentAgentRunScope()

  if (!flow?.outputStore) {
    return {
      capturedAt: new Date().toISOString(),
      classes: {
        AgentStepContext: {
          className: 'AgentStepContext',
          stepId: stepCtx.stepId,
          stepInstanceKey: stepCtx.stepInstanceKey,
        },
        AgentResponseOpts: {
          className: 'AgentResponseOpts',
          skillId: opts.skillId,
          agentId: opts.agentId,
          conversationId: opts.conversationId,
        },
      },
    }
  }

  const outputStoreKeys = flow.outputStore.keys()
  const outputStoreCounts = Object.fromEntries(
    outputStoreKeys.map((key) => [key, flow.outputStore.all(key).length]),
  )

  const stepHistorySummary = flow.stepHistory.map((entry) => ({
    stepId: entry.stepId,
    title: entry.title,
    stepInstanceKey: entry.stepInstanceKey,
  }))

  const activeStepContexts = Object.entries(flow.stepContexts).map(
    ([id, snap]) => ({
      stepId: id,
      title: snap?.title,
      stepInstanceKey: snap?.stepInstanceKey,
    }),
  )

  return {
    capturedAt: new Date().toISOString(),
    classes: {
      AgentStepContext: {
        className: 'AgentStepContext',
        stepId: stepCtx.stepId,
        title: stepCtx.title,
        stepInstanceKey: stepCtx.stepInstanceKey,
        flowStepConfig: stepCtx.flowStepConfig
          ? {
              title: stepCtx.flowStepConfig.title,
              foreachItemPreset: (
                stepCtx.flowStepConfig.foreachItem as
                  | { preset?: string }
                  | undefined
              )?.preset,
            }
          : undefined,
      },
      AgentFlowContext: {
        className: 'AgentFlowContext',
        flowId: flow.flowId,
        currentMessages: cloneMessages(flow.currentMessages),
        currentMessageCount: flow.currentMessages.length,
        clientUiMessageCount: flow.clientUiMessages?.length ?? 0,
        hitlAwaitingApproval: flow.hitlAwaitingApproval,
        hitlAwaitingFormData: flow.hitlAwaitingFormData,
        lastHitlPausedStageId: flow.lastHitlPausedStageId,
        approvalResumeTodoIndex: flow.approvalResumeTodoIndex,
        resumeTodoIndex: flow.resumeTodoIndex,
        pipelineGotoStageId: flow.pipelineGotoStageId,
        skillChainPlan: flow.skillChainPlan,
        skillChainResultAgentIds: [...flow.skillChainResults.keys()],
        collectedFormTodoIds: Object.keys(flow.collectedFormByTodoId).map(
          Number,
        ),
        generatedFormSchemaTodoIds: [...flow.generatedFormSchemaByTodoId.keys()],
        markdownReferenceKeys: [...flow.markdownReferenceBodyByKey.keys()],
        stepOutputs: summarizeStepOutputs(flow.stepOutputs),
        stepHistory: stepHistorySummary,
        activeStepContexts,
        runtimeToolNames: flow.runtimeTools.map((t) => t.name),
        executionStepKeys: flow.executionSteps
          ? Object.keys(flow.executionSteps).filter(
              (k) =>
                (flow.executionSteps as Record<string, unknown>)[k] != null,
            )
          : [],
      },
      AgentResponseOpts: {
        className: 'AgentResponseOpts',
        provider: opts.provider,
        model: opts.model,
        agentId: opts.agentId,
        skillId: opts.skillId,
        conversationId: opts.conversationId,
        assistantMessageId: opts.assistantMessageId,
        userId: opts.userId,
        llmDebugRunId: opts.llmDebugRunId,
        responseLanguage: opts.responseLanguage,
        availableSetCount: opts.availableSet?.length ?? 0,
        availableSetTouched: opts.availableSetTouched ?? false,
        mcpToolCount: opts.mcpTools?.length ?? 0,
        toolLoopMaxIterations: opts.toolLoopMaxIterations,
        hasClientUiMessages: (opts.clientUiMessages?.length ?? 0) > 0,
        hasCompiledArtifact: Boolean(opts.compiledArtifact),
      },
      AgentRun: stepCtx.agentRun
        ? {
            className: 'AgentRun',
            runId: stepCtx.agentRun.meta.runId,
            parentRunId: stepCtx.agentRun.meta.parentRunId,
            depth: stepCtx.agentRun.meta.depth,
            agentId: stepCtx.agentRun.meta.agentId,
            conversationId: stepCtx.agentRun.meta.conversationId,
            assistantMessageId: stepCtx.agentRun.meta.assistantMessageId,
          }
        : undefined,
      AgentRunScope: scope
        ? {
            className: 'AgentRunScopeStore',
            runId: scope.runId,
            parentRunId: scope.parentRunId,
            depth: scope.depth,
            sandboxRoot: scope.sandboxRoot,
            sandboxOutputScope: scope.sandboxOutputScope,
            workspacePath: scope.workspacePath,
          }
        : undefined,
      ConfigContext: {
        className: 'ConfigContext',
        responseLanguage: opts.responseLanguage,
      },
      ProviderContext: {
        className: 'ProviderContext',
        provider: opts.provider,
        model: opts.model,
        resolvedModel: serializeModel(flow.model),
      },
      SandboxContext: {
        className: 'SandboxContext',
        conversationId: flow.sandbox.getConversationId(),
        root: flow.sandbox.getRoot(),
        layout: flow.sandbox.layout
          ? {
              root: flow.sandbox.layout.root,
              skillsDir: flow.sandbox.layout.skillsDir,
              refsDir: flow.sandbox.layout.refsDir,
              scriptsDir: flow.sandbox.layout.scriptsDir,
              outputDir: flow.sandbox.layout.outputDir,
            }
          : undefined,
      },
      FormContext: {
        className: 'FormContext',
        collectedFormTodoIds: Object.keys(flow.collectedFormByTodoId).map(
          Number,
        ),
        clientUiIndicatesFormResume: flow.form.uiMessagesIndicateFormCollectionResume(),
      },
      ReferenceContext: {
        className: 'ReferenceContext',
      },
      StepOutputStore: {
        className: 'StepOutputStore',
        stepIds: outputStoreKeys,
        entryCounts: outputStoreCounts,
      },
    },
  }
}
