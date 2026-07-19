/**
 * Builds the wrapped tool map for tool-loop runs (guardrails → truncation →
 * recording → dedupe → plan/coding gates).
 */
import { jsonSchema } from '@teralexi-ai'
import { PLAN_MODE_TOOL_NAMES } from '@toolSet/planning'
import { SUB_AGENT_TOOL_NAMES } from '@toolSet/sub-agents'
import type { AgentFlowContext, AgentStepContext } from '../context'
import { applyCodingAgentPolicy } from '../coding/coding-agent-policy'
import { applyRuntimePlanModeGate } from '../coding/plan-mode-runtime-gate'
import {
  resolvePlanStorageOptionsForContext,
} from '../coding/plan-mode-execution-bridge'
import { applyPlanExecutionTodoGate } from '../coding/plan-mode-execution-todo-gate'
import {
  buildSubAgentCatalog,
  formatSubAgentToolSuffix,
} from '../delegation/skill-routing-catalog'
import { applyLspDiagnostics } from '../lsp'
import { assertFileToolPermissionAllowed } from '../permissions/tool-permission-gate'
import { applySessionToolApprovals } from '../session-tool-approval'
import {
  callMcpToolDirect,
  callSkillToolDirect,
  filterToolsByAvailableSet,
  resolveToolPathNormalizeContextFromRunCtx,
} from '../steps/step-helpers'
import { STEP_ERRORS } from '../constants/pipeline'
import { TOOL_LOOP_STEP_ID } from '../constants/step-ids'
import { applyToolAttachmentCollection } from './tool-attachment-collector'
import { applyToolOutputTruncation } from './context-overflow-guard'
import { applyToolGuardrails, ToolGuardrailController } from './tool-guardrails'
import {
  applyToolResultRecording,
  type ToolResultRecordingCtx,
} from './tool-result-recorder'
import { applyToolResultPresentation } from './apply-tool-result-presentation'
import { applyRunScopedReadCache } from './tool-read-cache'
import { applyReadFileLedgerGate } from './read-file-ledger-gate'
import { applyPerStreamToolInputDedupe } from '../steps/step-helpers'

export type BuildToolSetOpts = {
  guardrails?: ToolGuardrailController
  haltCtrl?: AbortController
  recordingCtx?: ToolResultRecordingCtx
}

function isRootAgentRun(runCtx: AgentStepContext): boolean {
  const depth = runCtx.agentRun?.meta?.depth
  return depth === undefined || depth === 0
}

/** Merge child tool-loop artifacts onto the visible parent step and stream to the UI. */
export function publishToolLoopAttachmentsForParent(
  flow: AgentFlowContext,
  parentKey?: string,
): void {
  const key = parentKey?.trim() || flow.stepContexts[TOOL_LOOP_STEP_ID]?.key
  if (key) flow.mergeToolLoopAttachmentsIntoParent(key)
}

export function buildAgentToolSet(
  tools: ReturnType<typeof filterToolsByAvailableSet>,
  runCtx: AgentStepContext,
  skillId?: string,
  opts?: BuildToolSetOpts,
): Record<string, unknown> {
  const userId = runCtx.opts.userId
  const toolSet: Record<string, unknown> = {}
  const toolNames = tools.map((t) => t.name)
  const subAgentCatalog = buildSubAgentCatalog(runCtx, toolNames)

  for (const toolMeta of tools) {
    if (PLAN_MODE_TOOL_NAMES.has(toolMeta.name) && !isRootAgentRun(runCtx)) {
      continue
    }
    if (SUB_AGENT_TOOL_NAMES.has(toolMeta.name) && !isRootAgentRun(runCtx)) {
      continue
    }
    if (
      SUB_AGENT_TOOL_NAMES.has(toolMeta.name) &&
      !runCtx.executionSteps?.toolLoop?.allowSubAgents
    ) {
      continue
    }
    const baseDesc = runCtx.config.buildToolPromptDescription(toolMeta)
    const suffix =
      subAgentCatalog && SUB_AGENT_TOOL_NAMES.has(toolMeta.name)
        ? formatSubAgentToolSuffix(toolMeta.name, subAgentCatalog)
        : null
    const needsApproval = SUB_AGENT_TOOL_NAMES.has(toolMeta.name)
      ? false
      : (toolMeta.needsApproval ?? false)
    toolSet[toolMeta.name] = {
      type: 'function' as const,
      description: suffix ? baseDesc + suffix : baseDesc,
      inputSchema:
        toolMeta.inputSchema != null
          ? jsonSchema(toolMeta.inputSchema)
          : (jsonSchema({
              type: 'object',
              additionalProperties: true,
            }) as never),
      needsApproval,
      async execute(input: unknown) {
        if (toolMeta.source === 'mcp') {
          return callMcpToolDirect(
            userId,
            (toolMeta as { serverId: string }).serverId,
            (toolMeta as { toolName: string }).toolName,
            input,
            runCtx,
          )
        }
        if (!skillId?.trim()) {
          throw new Error(
            STEP_ERRORS.TOOL_NO_SKILL_ID.replace('{toolName}', toolMeta.name),
          )
        }
        if (
          input != null &&
          typeof input === 'object' &&
          !Array.isArray(input)
        ) {
          assertFileToolPermissionAllowed(
            toolMeta.name,
            input as Record<string, unknown>,
            runCtx.opts.conversationId,
          )
        }
        return callSkillToolDirect(skillId, toolMeta.name, input, runCtx)
      },
    }
  }

  // Guardrails → truncation → recording → dedupe (outermost).
  if (opts?.guardrails && opts?.haltCtrl) {
    applyToolGuardrails(toolSet, opts.guardrails, opts.haltCtrl)
  }

  applyToolOutputTruncation(toolSet)

  // Append LSP diagnostics to file-change results (after truncation so they
  // survive, before recording so the persisted result includes them).
  applyLspDiagnostics(toolSet)
  applyToolResultPresentation(toolSet, {
    getSandboxRoot: () => runCtx.sandbox.getRoot(),
  })

  if (opts?.recordingCtx) {
    applyToolResultRecording(toolSet, opts.recordingCtx)
  }

  applyToolAttachmentCollection(toolSet, {
    getStepKey: () => runCtx.stepInstanceKey,
    getSandboxRoot: () => runCtx.sandbox.getRoot(),
    onAttachments: (items) => {
      runCtx.agentFlow.appendStepAttachments(runCtx.stepInstanceKey, items)
      publishToolLoopAttachmentsForParent(runCtx.flowContext)
    },
  })

  const pathContext = resolveToolPathNormalizeContextFromRunCtx(runCtx)
  applyRunScopedReadCache(toolSet, {
    cache: runCtx.agentFlow.toolReadCache,
    getPathContext: () => pathContext,
  })
  applyReadFileLedgerGate(toolSet, {
    cache: runCtx.agentFlow.toolReadCache,
    getPathContext: () => pathContext,
  })
  applyPerStreamToolInputDedupe(toolSet as Record<string, any>, {
    state: runCtx.agentFlow.toolInputDedupeState,
    pathContext,
  })
  applySessionToolApprovals(toolSet, runCtx.opts.conversationId)
  applyCodingAgentPolicy(
    toolSet as Record<string, { needsApproval?: unknown }>,
    runCtx.opts.conversationId,
    skillId,
    runCtx.agentRun?.meta?.depth,
  )
  applyRuntimePlanModeGate(
    toolSet as Record<string, { execute?: (input: unknown) => Promise<unknown> }>,
    runCtx.opts.conversationId,
    skillId,
    runCtx.agentRun?.meta?.depth,
  )
  applyPlanExecutionTodoGate(
    toolSet as Record<string, { execute?: (input: unknown) => Promise<unknown> }>,
    runCtx.opts.conversationId,
    resolvePlanStorageOptionsForContext(runCtx),
  )
  return toolSet
}
