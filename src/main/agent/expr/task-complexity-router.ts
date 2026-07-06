import type { AgentStepContext } from '../context'
import type { AgentMessage } from '../types'
import { Output } from '@teralexi-ai'
import { z } from 'zod'
import { runExpressionLlmObject } from './run-expression-llm'
import type { StepExpressionPlan } from './expression-plan'
import {
  normalizeThinkingOutput,
  type LooseThinkingOutput,
  type NormalizedThinkingOutput,
} from '../utils/thinking-parse'
import { correctMisroutedThinking, agentHasRunnableTools } from './thinking-route-guard'
import { canAutoActivatePlanMode } from '../coding/auto-plan-mode'

const complexityRouterSchema = z.object({
  execution_mode: z
    .enum(['planning', 'agent_call', 'direct_answer'])
    .describe(
      'Use planning for multi-step or multi-file work needing approval. Use agent_call for focused single changes.',
    ),
  goal: z.string().describe('One sentence — overall user intent'),
  task: z.string().describe('One sentence — what they want now'),
  context: z.array(z.string()).max(3),
  rationale: z.string(),
  response: z.string(),
})

const complexityRouterOutputSpec = (Output.object as any)({
  schema: complexityRouterSchema,
})

const ROUTER_INSTRUCTIONS = `You classify whether a coding task should enter **explore mode** before making changes.

Choose execution_mode:
- planning — work spans multiple steps, many files, unclear scope, architecture/refactor/migration, or needs user approval before edits.
- agent_call — a focused change the agent can execute directly (single feature, small fix, one file).

Ignore direct_answer; always use agent_call or planning for coding tasks.
Do not ask questions. Prefer agent_call when the task is small and clear.`

/**
 * Silent task router (no Thinking step output). Used only to decide auto explore mode.
 */
export async function classifyTaskComplexity(
  ctx: AgentStepContext,
): Promise<NormalizedThinkingOutput | null> {
  if (!canAutoActivatePlanMode(ctx.opts.conversationId, ctx.opts.skillId)) {
    return null
  }

  const userContent = ctx.getLatestUserMessageContent().trim()
  if (!userContent) return null

  const plan: StepExpressionPlan = {
    title: 'Task complexity',
    instructions: ROUTER_INSTRUCTIONS,
  }

  const messages: AgentMessage[] = [{ role: 'user', content: userContent }]

  const parsed = await runExpressionLlmObject<LooseThinkingOutput>(
    ctx,
    plan,
    messages,
    {
      output: complexityRouterOutputSpec,
      maxOutputTokens: 400,
      streamToProgress: false,
      stage: 'explore',
    },
  )

  let thinking = normalizeThinkingOutput(parsed)
  thinking = correctMisroutedThinking(thinking, userContent, {
    toolsEnabled: agentHasRunnableTools(ctx),
  })
  return thinking
}
