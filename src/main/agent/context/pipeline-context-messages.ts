import type { AgentMessage } from '../types'
import type { AgentFlowContext } from '../context'
import {
  CREATE_PAPER_STEP_ID,
  PLANNING_STEP_ID,
  SEARCH_STEP_ID,
  SUMMARY_STEP_ID,
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
  WEB_SCRAPE_STEP_ID,
} from '../constants/step-ids'
import { PIPELINE_CONTEXT_LLM } from '../constants'
import { formatPlanningExpectations } from '../utils/agent-parsing'
import { formatSummaryForContext } from '../utils/summary-parse'
import type { PlanningStepData } from '../steps/step-io'

export type PipelineContextMessageOptions = {
  /** Skills + tool-loop material (default true). */
  execution?: boolean
  /** Thinking digest (e.g. report). */
  thinking?: boolean
  /** Planning text / final goal (e.g. report). */
  planning?: boolean
  /** Pipeline summary (goal, plan, execution) for the report step. */
  summary?: boolean
  /**
   * Analysis/report: include final goal, ordered planned tasks, and per-todo tool
   * output (not the raw history aggregate that duplicates batch rollups under HITL).
   */
  orderedExecution?: boolean
}

/**
 * User messages built from stepOutputs after recovering completed steps.
 * Used by summary and report.
 */
export function buildPipelineContextMessages(
  host: AgentFlowContext,
  opts: PipelineContextMessageOptions = {},
): AgentMessage[] {
  const includeExecution = opts.execution !== false
  const messages: AgentMessage[] = []
  const reg = host.pipelineRegistry

  if (opts.thinking) {
    const def = reg?.get(THINKING_STEP_ID)
    const entries = host.outputStore.all(THINKING_STEP_ID)
    if (def?.toContextMessages && entries.length > 0) {
      messages.push(...def.toContextMessages(entries, host))
    } else {
      const raw = host.stepOutputs.thinking?.raw?.trim()
      if (raw) {
        messages.push({
          role: 'user',
          content: `${PIPELINE_CONTEXT_LLM.THINKING}\n\n${raw}`,
        })
      }
    }
  }

  if (opts.planning) {
    const def = reg?.get(PLANNING_STEP_ID)
    const entries = host.outputStore.all(PLANNING_STEP_ID)
    if (def?.toContextMessages && entries.length > 0) {
      messages.push(...def.toContextMessages(entries, host))
    } else {
      const plan = host.stepOutputs.planning
      const planText = plan?.raw?.trim() || plan?.finalGoal?.trim()
      if (planText) {
        messages.push({
          role: 'user',
          content: `${PIPELINE_CONTEXT_LLM.PLANNING}\n\n${planText}`,
        })
      }
    }
  }

  if (opts.orderedExecution) {
    const plan = host.stepOutputs.planning
    const finalGoal = plan?.finalGoal?.trim()
    if (finalGoal) {
      messages.push({
        role: 'user',
        content: `${PIPELINE_CONTEXT_LLM.FINAL_GOAL}\n\n${finalGoal}`,
      })
    }
    const planData = host.outputStore.latest<PlanningStepData>(PLANNING_STEP_ID)
    const expectations = plan?.expectations ?? planData?.expectations ?? []
    if (expectations.length > 0) {
      messages.push({
        role: 'user',
        content: `${PIPELINE_CONTEXT_LLM.RUN_EXPECTATIONS}\n\n${formatPlanningExpectations(expectations)}`,
      })
    }
    const outline = host.formatPlannedTasksOutlineForSummary()
    if (outline) {
      messages.push({
        role: 'user',
        content: `${PIPELINE_CONTEXT_LLM.PLANNED_TASKS}\n\n${outline}`,
      })
    }
  }

  if (includeExecution) {
    const searchDef = reg?.get(SEARCH_STEP_ID)
    const searchEntries = host.outputStore.all(SEARCH_STEP_ID)
    if (searchDef?.toContextMessages && searchEntries.length > 0) {
      messages.push(...searchDef.toContextMessages(searchEntries, host))
    }

    const webScrapeDef = reg?.get(WEB_SCRAPE_STEP_ID)
    const webScrapeEntries = host.outputStore.all(WEB_SCRAPE_STEP_ID)
    if (webScrapeDef?.toContextMessages && webScrapeEntries.length > 0) {
      messages.push(...webScrapeDef.toContextMessages(webScrapeEntries, host))
    }

    const createPaperDef = reg?.get(CREATE_PAPER_STEP_ID)
    const createPaperEntries = host.outputStore.all(CREATE_PAPER_STEP_ID)
    if (createPaperDef?.toContextMessages && createPaperEntries.length > 0) {
      messages.push(
        ...createPaperDef.toContextMessages(createPaperEntries, host),
      )
    }

    const def = reg?.get(TOOL_LOOP_STEP_ID)
    const entries = host.outputStore.all(TOOL_LOOP_STEP_ID)
    if (
      def?.toContextMessages &&
      entries.length > 0 &&
      !opts.orderedExecution
    ) {
      messages.push(...def.toContextMessages(entries, host))
    } else {
      const skills = host.stepOutputs.skills?.trim()
      if (skills) {
        messages.push({
          role: 'user',
          content: `${PIPELINE_CONTEXT_LLM.SKILLS_OUTPUT}\n\n${skills}`,
        })
      }
      if (opts.orderedExecution) {
        const ordered = host.formatOrderedExecutionForSummary()
        if (ordered.toolExecution?.trim()) {
          messages.push({
            role: 'user',
            content: `${PIPELINE_CONTEXT_LLM.TOOL_EXECUTION_ORDERED}\n\n${ordered.toolExecution.trim()}`,
          })
        }
        if (ordered.skillsFallback?.trim()) {
          messages.push({
            role: 'user',
            content: `${PIPELINE_CONTEXT_LLM.SKILLS_OUTPUT}\n\n${ordered.skillsFallback.trim()}`,
          })
        }
      } else {
        const toolLoop = host.stepOutputs.toolLoop?.trim()
        if (toolLoop) {
          messages.push({
            role: 'user',
            content: `${PIPELINE_CONTEXT_LLM.TOOL_EXECUTION_OUTPUT}\n\n${toolLoop}`,
          })
        }
      }
    }

    // Append collected form values so downstream steps (summary, retry) see what was submitted.
    const formEntries = Object.entries(host.collectedFormByTodoId)
    if (formEntries.length > 0) {
      const lines = formEntries
        .map(([id, vals]) => `Todo #${id}: ${JSON.stringify(vals)}`)
        .join('\n')
      messages.push({
        role: 'user',
        content: `Collected form data:\n${lines}`,
      })
    }
  }

  if (opts.summary) {
    const def = reg?.get(SUMMARY_STEP_ID)
    const entries = host.outputStore.all(SUMMARY_STEP_ID)
    if (def?.toContextMessages && entries.length > 0) {
      messages.push(...def.toContextMessages(entries, host))
    } else if (host.stepOutputs.summary?.summary?.trim()) {
      messages.push({
        role: 'user',
        content: `${PIPELINE_CONTEXT_LLM.RUN_SUMMARY}\n\n${formatSummaryForContext(host.stepOutputs.summary)}`,
      })
    }
  }

  return messages
}
