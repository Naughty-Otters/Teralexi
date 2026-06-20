import { compileDsl } from '@main/agent/flow/dsl/compile'
import { AgentFlowBuilder } from '@main/agent/flow/agent-flow-builder'
import { loadEngineAgentForSkill } from '@main/agent/config/catalog'
import { createLlmDebugRunId } from '@main/agent/llm/llm-debug-writer'
import { StageModelRegistry } from '@main/agent/providers/stage-model-registry'
import { AgentRun } from '@main/agent/run/agent-run'
import type { AgentResponseOpts } from '@main/agent/types'
import {
  loadAgentRunCredentials,
  loadMcpToolsForAgent,
  resolveEnabledSkillToolNames,
} from '@main/agent/utils'
import { resolveResponseLanguageForAgent } from '@main/i18n/resolve-response-language'
import { WORKFLOW_RUNTIME_SKILL_ID } from '@main/skills/skill-visibility'
import { randomShortUuid } from '@shared/utils/short-uuid'
import type { WorkflowDefinition } from '@shared/workflows/schema'
import { workflowDefinitionToAgentFlowDsl } from '@shared/workflows/to-agent-flow-dsl'

export type WorkflowAgentRunRequest = {
  userId: string
  definition: WorkflowDefinition
  inputs: Record<string, unknown>
  conversationId: string
  runId?: string
  assistantMessageId?: string
}

export type WorkflowAgentRunResult = {
  success: boolean
  structuredContent: string
  stepOutputs: Record<string, unknown>
  hitlPaused: boolean
  errorMessage?: string
}

export function resolveExecutorSkillFolderId(
  definition: WorkflowDefinition,
): string {
  const agentId = definition.executor?.agentId?.trim()
  if (!agentId) return WORKFLOW_RUNTIME_SKILL_ID
  if (agentId.startsWith('skill:')) {
    const id = agentId.slice('skill:'.length)
    return id === 'default' ? WORKFLOW_RUNTIME_SKILL_ID : id
  }
  return WORKFLOW_RUNTIME_SKILL_ID
}

function buildWorkflowRunPrompt(
  definition: WorkflowDefinition,
  inputs: Record<string, unknown>,
): string {
  return [
    `Execute workflow "${definition.name}" (id: ${definition.id}).`,
    '',
    'Workflow inputs (bound from trigger):',
    '```json',
    JSON.stringify(inputs, null, 2),
    '```',
    '',
    'Follow the compiled pipeline stages for this workflow. Use tools and channels as defined in each step.',
  ].join('\n')
}

/** Run a workflow through the existing AgentFlow + AgentRun skill engine. */
export async function runWorkflowViaAgentFlow(
  request: WorkflowAgentRunRequest,
): Promise<WorkflowAgentRunResult> {
  const skillFolderId = resolveExecutorSkillFolderId(request.definition)
  const agent = await loadEngineAgentForSkill(request.userId, skillFolderId)
  const credentials = loadAgentRunCredentials()
  const mcpTools = await loadMcpToolsForAgent(request.userId, agent)
  const enabledSkillTools = resolveEnabledSkillToolNames(agent)

  const dsl = workflowDefinitionToAgentFlowDsl(request.definition)
  const compiled = compileDsl(dsl)
  if (compiled.pipeline.length === 0) {
    throw new Error('Workflow pipeline is empty')
  }

  const userPrompt = buildWorkflowRunPrompt(request.definition, request.inputs)
  const assistantMessageId =
    request.assistantMessageId ?? `wf-asst-${randomShortUuid()}`

  const opts: AgentResponseOpts = {
    provider: agent.provider,
    model: agent.model,
    stageLlm: agent.stageLlmSettings,
    systemPrompt: agent.systemPrompt,
    responseLanguage: resolveResponseLanguageForAgent(agent.responseLanguage),
    messages: [{ role: 'user', content: userPrompt }],
    executionSteps: agent.executionSteps,
    toolLoopMaxIterations:
      agent.executionSteps?.toolLoop?.maxIterations ??
      agent.toolLoopMaxIterations,
    todoMaxRetries: agent.todoMaxRetries,
    skillId: agent.skillId,
    compiledArtifact: agent.compiledArtifact,
    agentId: agent.id,
    availableSet: enabledSkillTools,
    availableSetTouched: !!agent.availableSetTouched,
    toolNeedsApprovalOverrides: agent.toolNeedsApprovalOverrides ?? {},
    mcpTools,
    userId: request.userId,
    conversationId: request.conversationId,
    assistantMessageId,
    llmDebugRunId: createLlmDebugRunId(),
    onChunk: () => {},
    ...credentials,
  }

  const stageModels = StageModelRegistry.fromOpts(opts)
  const model = stageModels.getModel('default')

  const flow = AgentFlowBuilder.create(opts, model).build()
  flow.fromDsl(compiled)

  const run = AgentRun.forFlow(flow, {
    ...(request.runId ? { runId: request.runId } : {}),
    conversationId: request.conversationId,
    agentId: agent.id,
  })

  try {
    const result = await run.execute()
    const hitlPaused = result.hitlPaused
    return {
      success: !hitlPaused,
      structuredContent: result.structuredContent,
      stepOutputs: result.stepOutputs,
      hitlPaused,
      ...(hitlPaused
        ? { errorMessage: 'Workflow paused for human-in-the-loop approval' }
        : {}),
    }
  } catch (err: unknown) {
    return {
      success: false,
      structuredContent: '',
      stepOutputs: {},
      hitlPaused: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    }
  }
}
