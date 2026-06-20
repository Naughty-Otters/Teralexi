import type { AgentMessage } from '../types'
import type { StepExpressionPlan } from './expression-plan'

/**
 * Build AI SDK `streamText` / `generateText` params from an expression plan.
 *
 * - `system_msg` → `instructions` (and `system` for streamText compatibility in this codebase)
 * - `prompt` → final user message in `messages`
 */
export function buildExpressionLlmCallParams(
  plan: Pick<StepExpressionPlan, 'instructions' | 'userPrompt'>,
  baseMessages: AgentMessage[],
): {
  instructions: string | undefined
  system: string | undefined
  messages: AgentMessage[]
} {
  const instructions = plan.instructions?.trim() || undefined
  const messages = [...baseMessages]
  if (plan.userPrompt?.trim()) {
    messages.push({ role: 'user', content: plan.userPrompt.trim() })
  }
  return {
    instructions,
    system: instructions,
    messages,
  }
}
