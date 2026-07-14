import { jsonSchema, stepCountIs, type ModelMessage } from '@teralexi-ai'
import type { AgentStepContext } from '../context'
import {
  applyThinkingReadonlyPolicy,
  resolveThinkingReadonlyToolNames,
  thinkingReadonlyToolsAvailable,
} from './thinking-readonly-tools'
import {
  callMcpToolDirect,
  callSkillToolDirect,
  createAgent,
  filterToolsByAvailableSet,
  streamAgent,
} from '../steps/step-helpers'
import { assertFileToolPermissionAllowed } from '../permissions/tool-permission-gate'
import { applyToolOutputTruncation } from './context-overflow-guard'
import { applyToolResultPresentation } from './apply-tool-result-presentation'
import { THINKING_STEP_ID } from '../constants/step-ids'

const THINKING_RESEARCH_MAX_STEPS = 3

const THINKING_RESEARCH_INSTRUCTIONS = `You are a read-only research assistant helping route the user's request.

Use available read-only tools (read_file, grep, web_search, git_status, etc.) only when you need facts from the codebase, workspace, or web to decide how to handle the request.

Rules:
- Do NOT mutate files, run scripts, or call planning/todo tools.
- Keep research brief — at most a few tool calls.
- Finish with a short summary of what you learned (plain text, not JSON).`

function buildThinkingResearchToolSet(
  ctx: AgentStepContext,
): Record<string, unknown> {
  const tools = filterToolsByAvailableSet(
    ctx.runtimeTools,
    ctx.opts.availableSet,
    ctx.opts.conversationId,
  )
  const allowedNames = new Set(resolveThinkingReadonlyToolNames(tools.map((t) => t.name)))
  const skillId = ctx.opts.skillId?.trim()
  const userId = ctx.opts.userId
  const toolSet: Record<string, unknown> = {}

  for (const toolMeta of tools) {
    if (!allowedNames.has(toolMeta.name)) continue
    toolSet[toolMeta.name] = {
      type: 'function' as const,
      description: ctx.config.buildToolPromptDescription(toolMeta),
      inputSchema:
        toolMeta.inputSchema != null
          ? jsonSchema(toolMeta.inputSchema)
          : (jsonSchema({
              type: 'object',
              additionalProperties: true,
            }) as never),
      needsApproval: false,
      async execute(input: unknown) {
        if (toolMeta.source === 'mcp') {
          return callMcpToolDirect(
            userId,
            (toolMeta as { serverId: string }).serverId,
            (toolMeta as { toolName: string }).toolName,
            input,
            ctx,
          )
        }
        if (!skillId) {
          throw new Error(`Tool ${toolMeta.name} requires a skill id.`)
        }
        if (
          input != null &&
          typeof input === 'object' &&
          !Array.isArray(input)
        ) {
          assertFileToolPermissionAllowed(
            toolMeta.name,
            input as Record<string, unknown>,
            ctx.opts.conversationId,
          )
        }
        return callSkillToolDirect(skillId, toolMeta.name, input, ctx)
      },
    }
  }

  applyThinkingReadonlyPolicy(toolSet)
  applyToolOutputTruncation(toolSet)
  applyToolResultPresentation(toolSet, {
    getSandboxRoot: () => ctx.sandbox.getRoot(),
  })
  return toolSet
}

/** Optional capped readonly tool pass before the thinking JSON router. */
export async function runThinkingResearchPass(
  ctx: AgentStepContext,
): Promise<string | null> {
  const allNames = filterToolsByAvailableSet(
    ctx.runtimeTools,
    ctx.opts.availableSet,
    ctx.opts.conversationId,
  ).map((t) => t.name)
  if (!thinkingReadonlyToolsAvailable(allNames)) return null
  if (!ctx.opts.skillId?.trim() && !allNames.some((n) => n.startsWith('mcp_'))) {
    return null
  }

  ctx.sandbox.syncBindingToTools()
  ctx.sandbox.syncWorkspaceToTools()

  const toolSet = buildThinkingResearchToolSet(ctx)
  if (Object.keys(toolSet).length === 0) return null

  const userContent = ctx.getLatestUserMessageContent()
  const exploreChoice = ctx.resolveStageChoice('explore')
  const agent = createAgent({
    name: 'thinking-research',
    model: ctx.resolveStageModel('explore'),
    tools: toolSet,
    instructions: THINKING_RESEARCH_INSTRUCTIONS,
    stopWhen: [stepCountIs(THINKING_RESEARCH_MAX_STEPS)],
    abortSignal: ctx.opts.abortSignal,
    toolChoice: 'auto',
    provider: exploreChoice.provider,
    modelId: exploreChoice.model,
    providerOptions: exploreChoice.providerOptions,
  })

  const messages: ModelMessage[] = [{ role: 'user', content: userContent }]
  const collected = await streamAgent({
    agent,
    messages,
    toolRunCtx: ctx,
    onChunk: (chunk) => ctx.emitStepProgress(chunk),
    usageMeta: {
      opts: ctx.opts,
      providers: ctx.providers,
      stepId: THINKING_STEP_ID,
      source: 'thinking-research',
    },
    debugCall: {
      instructions: THINKING_RESEARCH_INSTRUCTIONS,
      toolNames: Object.keys(toolSet),
      label: 'thinking-research',
    },
  })

  const text = collected.text?.trim()
  return text || null
}
