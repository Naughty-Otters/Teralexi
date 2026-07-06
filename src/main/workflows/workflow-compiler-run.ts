import type { ModelMessage } from '@teralexi-ai'
import { stepCountIs } from '@teralexi-ai'
import { loadAgentRunCredentials } from '@main/agent/utils'
import { createModelForProvider } from '@main/agent/providers/adapters'
import { buildAgentExecutionContext } from '@main/agent/agent-memory'
import { createAgent } from '@main/agent/steps/step-helpers'
import { runAgentStream } from '@main/agent/llm/runtime'
import { WORKFLOW_COMPILER_SKILL_ID } from '@main/skills/skill-visibility'
import { readWorkflowDefinitionSource, syncWorkflowSourceFiles } from './workflow-store'
import type { StoredWorkflowVersion } from '@main/services/conversation-store/types'
import {
  WORKFLOW_COMPILER_SOURCE_SCOPE_APPENDIX,
} from './workflow-source-tools'
import { workflowSourceFolderHint } from './workflow-source-scope'
import { runWithWorkflowCompileContext } from './workflow-compile-context'
import { loadWorkflowCompilerAgentTools } from './workflow-source-tool-adapter'

const WORKFLOW_COMPILER_MAX_STEPS = 10

export async function compileWorkflowWithTools(args: {
  workflowId: string
  workflowName: string
  userId: string
  systemPrompt: string
  userPrompt: string
  provider: string
  model: string
  knownTools?: Set<string>
  conversationId?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  abortSignal?: AbortSignal
  onChunk?: (chunk: string) => void
  onUIMessageChunk?: (chunk: Record<string, unknown>) => void
  seedVersion?: StoredWorkflowVersion | null
}): Promise<{ assistantText: string }> {
  syncWorkflowSourceFiles({
    workflowId: args.workflowId,
    name: args.workflowName,
    version: args.seedVersion,
  })

  const credentials = loadAgentRunCredentials()
  const languageModel = createModelForProvider(
    args.provider as Parameters<typeof createModelForProvider>[0],
    args.model,
    credentials,
  )

  const toolCtx = {
    workflowId: args.workflowId,
    workflowName: args.workflowName,
    knownTools: args.knownTools,
    sourceDir: workflowSourceFolderHint(args.workflowId),
  }
  const tools = await loadWorkflowCompilerAgentTools()
  const sourceDir = workflowSourceFolderHint(args.workflowId)
  const existing = readWorkflowDefinitionSource(args.workflowId)

  const instructions = `${args.systemPrompt}\n${WORKFLOW_COMPILER_SOURCE_SCOPE_APPENDIX}\n\nWorkflow source directory: ${sourceDir}`

  const userParts: string[] = []
  const hasHistory = (args.history?.length ?? 0) > 0

  if (!hasHistory) {
    userParts.push(
      `Workflow id: ${args.workflowId}`,
      `Workflow name: ${args.workflowName}`,
      `Source directory: ${sourceDir}`,
      '',
      'Use write_workflow_definition / edit_workflow_definition for workflow_definition.json.',
      'Use write_entities_definition / edit_entities_definition or add_entity_field / update_entity_field / delete_entity_field for entities_definition.json.',
      'After each write/edit, check valid and validationErrors in the tool result. Fix errors before finishing.',
      '',
    )
    if (existing?.workflowDefinitionJson.trim()) {
      userParts.push('Source JSON files are on disk — read them before editing.')
    }
  }

  userParts.push('User request:', args.userPrompt)

  const messages: ModelMessage[] = []
  for (const row of args.history ?? []) {
    if (!row.content.trim()) continue
    messages.push({ role: row.role, content: row.content })
  }
  messages.push({ role: 'user', content: userParts.join('\n') })

  return runWithWorkflowCompileContext(toolCtx, async () => {
    const agent = createAgent({
      name: 'workflow-compiler',
      model: languageModel,
      tools,
      instructions,
      stopWhen: [stepCountIs(WORKFLOW_COMPILER_MAX_STEPS)],
      provider: args.provider,
      modelId: args.model,
      toolChoice: 'auto',
      abortSignal: args.abortSignal,
    })

    const executionContext = await buildAgentExecutionContext({
      userId: args.userId,
      conversationId: args.conversationId ?? `wf-compile-${args.workflowId}`,
      agentId: `skill:${WORKFLOW_COMPILER_SKILL_ID}`,
    })

    const streamArgs = {
      messages,
      executionContext,
      abortSignal: args.abortSignal,
    } as Parameters<typeof agent.stream>[0]

    const result = await agent.stream(streamArgs)

    const collected = await runAgentStream({
      result,
      mode: 'progress',
      onChunk: args.onChunk ?? (() => {}),
      onUIMessageChunk: args.onUIMessageChunk,
    })

    return { assistantText: collected.text?.trim() ?? '' }
  })
}
