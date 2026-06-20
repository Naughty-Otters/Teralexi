import type { ResearchStepContext } from './research-step-context'
import type { PlanningResult, TodoItem } from '../../types'
import { executeTodoToolLoop } from '../../expr/tool-loop-expr'
import type { ResolvedResearchConfig } from './config'
import { RESEARCH_LLM } from './research-llm'

export type GatherEvidenceResult = {
  question: string
  output: string
  awaitingToolApproval: boolean
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function buildSyntheticTodo(question: string, seq: number, gatherPrompt?: string): TodoItem {
  const hint = gatherPrompt?.trim() || RESEARCH_LLM.GATHER_HINT
  return {
    id: seq,
    name: `Research: ${truncate(question, 80)}`,
    description: `Search and scrape credible sources to answer: "${question}". ${hint}`,
    success_criteria:
      'Relevant sources found and substantive content extracted.',
    fallback_plan: 'retry',
    status: 'pending',
  }
}

export async function gatherEvidence(
  ctx: ResearchStepContext,
  question: string,
  config: ResolvedResearchConfig,
  seq: number,
  topic: string,
): Promise<GatherEvidenceResult> {
  const todoItem = buildSyntheticTodo(question, seq, config.gatherPrompt)
  const plan: PlanningResult = {
    finalGoal: topic,
    todoList: [todoItem],
    expectations: [],
  }

  const result = await executeTodoToolLoop(ctx, {
    todoItem,
    todoIndexInPlan: 0,
    plan,
    attempt: 1,
    maxAttempts: 1,
    lastRetryContext: '',
    route: 'normal',
    stepProgressCtx: ctx,
  })

  return {
    question,
    output: result.output?.trim() || '',
    awaitingToolApproval: result.awaitingToolApproval,
  }
}
