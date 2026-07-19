import { formatToolResultForDisplay } from '@shared/tool-result/format-tool-result-for-display'
import { isAgenticRunParentStepTitle } from '@shared/agent/agentic-run-labels'
import { STRUCTURED_CONTENT_LLM } from '../constants'
import {
  PLANNING_STEP_ID,
  TOOL_LOOP_STEP_ID,
} from '../constants/step-ids'
import type {
  AgentStepContext as AgentStepSnapshot,
  AgentStepId,
  StepOutputs,
} from '../types'
import type { StepOutputStore } from '../steps/step-output-store'
import type { PlanningStepData } from '../steps/step-io'

export function formatAgentStepOutputBody(
  step: Pick<AgentStepSnapshot, 'renderedOutput' | 'output'>,
): string {
  const rendered = step.renderedOutput?.trim()
  if (rendered) return rendered
  if (typeof step.output === 'string') return step.output.trim()
  if (step.output != null) return formatToolResultForDisplay(step.output)
  return ''
}

export function getCompletedStepsForId(
  orderedSteps: readonly AgentStepSnapshot[],
  stepId: AgentStepId,
): AgentStepSnapshot[] {
  return orderedSteps.filter(
    (s) => s.stepId === stepId && Boolean(s.completedAt),
  )
}

export function formatCompletedStepSegment(step: AgentStepSnapshot): string {
  const body = formatAgentStepOutputBody(step)
  const summary = step.summary?.trim()
  const parts: string[] = []
  if (step.title?.trim()) parts.push(`**${step.title.trim()}**`)
  if (step.goal?.trim()) parts.push(`**Goal:**\n${step.goal.trim()}`)
  if (summary) parts.push(`**Summary:**\n${summary}`)
  if (body) parts.push(body)
  return parts.join('\n\n').trim()
}

/** Completed tool-loop rows excluding HITL pause snapshots. */
export function getToolLoopStepsForDigest(
  orderedSteps: readonly AgentStepSnapshot[],
): AgentStepSnapshot[] {
  return getCompletedStepsForId(orderedSteps, TOOL_LOOP_STEP_ID).filter(
    (s) => s.meta?.pendingApproval !== true,
  )
}

export function isBatchToolLoopRollupStep(step: AgentStepSnapshot): boolean {
  return (
    isAgenticRunParentStepTitle(step.title) &&
    typeof step.meta?.todoId !== 'number'
  )
}

export function latestToolLoopStepByTodoId(
  steps: AgentStepSnapshot[],
): Map<number, AgentStepSnapshot> {
  const byTodo = new Map<number, AgentStepSnapshot>()
  for (const s of steps) {
    const todoId = s.meta?.todoId
    if (typeof todoId !== 'number' || !Number.isFinite(todoId)) continue
    const prev = byTodo.get(todoId)
    if (!prev || s.sequence > prev.sequence) {
      byTodo.set(todoId, s)
    }
  }
  return byTodo
}

export type StepIoHistoryHost = {
  outputStore: StepOutputStore
  stepOutputs: StepOutputs
  getOrderedStepContexts: () => AgentStepSnapshot[]
}

/**
 * Planned-task outline for summary/report (status + output excerpt from plan state).
 */
export function formatPlannedTasksOutlineForSummary(
  host: StepIoHistoryHost,
): string {
  const planData = host.outputStore.latest<PlanningStepData>(PLANNING_STEP_ID)
  const todos = planData?.todoList ?? host.stepOutputs.planning?.todoList ?? []
  if (todos.length === 0) return ''
  return todos
    .map((t) => {
      const head = `- Task ${t.id} [${t.status}]: ${t.name?.trim() || '(unnamed)'}`
      const desc = t.description?.trim()
      const criteria = t.success_criteria?.trim()
      const lines = [head]
      if (desc) lines.push(`  Description: ${desc}`)
      if (criteria) lines.push(`  Success criteria: ${criteria}`)
      return lines.join('\n')
    })
    .join('\n')
}

/**
 * Ordered per-todo execution material for summary/report (stable under HITL resumes).
 */
export function formatOrderedExecutionForSummary(host: StepIoHistoryHost): {
  toolExecution: string
  skillsFallback: string
} {
  const planData = host.outputStore.latest<PlanningStepData>(PLANNING_STEP_ID)
  const plan = host.stepOutputs.planning
  const todos = planData?.todoList ?? plan?.todoList ?? []
  const steps = getToolLoopStepsForDigest(host.getOrderedStepContexts())
  const byTodoId = latestToolLoopStepByTodoId(steps)
  const hasPerTodoSteps = byTodoId.size > 0

  const sections: string[] = []

  if (todos.length > 0) {
    for (const t of todos) {
      const step = byTodoId.get(t.id)
      const header = STRUCTURED_CONTENT_LLM.TASK_HEADER.replace(
        '{id}',
        String(t.id),
      )
        .replace(
          '{name}',
          t.name?.trim() || STRUCTURED_CONTENT_LLM.TASK_UNNAMED,
        )
        .replace('{status}', t.status)
      if (step) {
        const body = formatCompletedStepSegment(step)
        sections.push(body ? `${header}\n\n${body}` : header)
        continue
      }
      const out = t.output?.trim()
      if (!out) {
        sections.push(
          `${header}\n\n(No tool-loop step output recorded for this task.)`,
        )
      }
    }
  } else if (hasPerTodoSteps) {
    const ordered = [...byTodoId.entries()].sort(([a], [b]) => a - b)
    for (const [, step] of ordered) {
      const seg = formatCompletedStepSegment(step)
      if (seg) sections.push(seg)
    }
  }

  if (sections.length === 0) {
    const fallback = steps
      .filter((s) => !hasPerTodoSteps || !isBatchToolLoopRollupStep(s))
      .map((s) => formatCompletedStepSegment(s))
      .filter(Boolean)
      .join('\n\n---\n\n')
    return { toolExecution: fallback, skillsFallback: '' }
  }

  return { toolExecution: sections.join('\n\n---\n\n'), skillsFallback: '' }
}

/** Canonical tool-loop digest for {@link stepOutputs} and downstream steps. */
export function buildToolLoopOutputDigest(host: StepIoHistoryHost): string {
  const { toolExecution } = formatOrderedExecutionForSummary(host)
  if (toolExecution.trim()) return toolExecution.trim()
  return getToolLoopStepsForDigest(host.getOrderedStepContexts())
    .filter((s) => !isBatchToolLoopRollupStep(s))
    .map((s) => formatCompletedStepSegment(s))
    .filter(Boolean)
    .join('\n\n---\n\n')
}

export function aggregateStringOutputsFromHistory(
  host: StepIoHistoryHost,
  stepId: AgentStepId,
): string {
  if (stepId === TOOL_LOOP_STEP_ID) {
    const digest = buildToolLoopOutputDigest(host)
    if (digest) return digest
  }
  return getCompletedStepsForId(host.getOrderedStepContexts(), stepId)
    .filter((s) => s.meta?.pendingApproval !== true)
    .map((s) => formatCompletedStepSegment(s))
    .filter(Boolean)
    .join('\n\n---\n\n')
}

export function latestStructuredOutputFromHistory<T>(
  orderedSteps: readonly AgentStepSnapshot[],
  stepId: AgentStepId,
): T | undefined {
  const steps = getCompletedStepsForId(orderedSteps, stepId)
  if (steps.length === 0) return undefined
  return steps[steps.length - 1]!.output as T
}
