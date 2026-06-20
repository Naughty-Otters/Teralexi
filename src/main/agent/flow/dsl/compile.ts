import type { FlowStageId } from '../../constants/step-ids'
import {
  FOREACH_ITEM_STEP_ID,
  PLANNING_STEP_ID,
  REPORT_STEP_ID,
  SUMMARY_STEP_ID,
  THINKING_STEP_ID,
  TOOL_LOOP_STEP_ID,
  PROMPT_STEP_ID,
  SUB_FLOW_STEP_ID,
  SEARCH_STEP_ID,
  WEB_SCRAPE_STEP_ID,
  CREATE_PAPER_STEP_ID,
} from '../../constants/step-ids'
import { createPaperFlowStepDefinition } from '../../steps/create-paper-step'
import { subFlowFlowStepDefinition } from '../../steps/sub-flow-step'
import { searchFlowStepDefinition } from '../../steps/search-step'
import { webScrapeFlowStepDefinition } from '../../steps/web-scrape-step'
import type { FlowConditionalBranch, FlowStepConfig, PipelineEntry } from '../pipeline'
import type { StepExpressionPlan } from '../../expr/expression-plan'
import { resolveStepWhenCondition } from '../../expr/when-presets'
import { resolveWhenHarnessCondition } from '../../expr/when-harness-presets'
import { defaultPlanningTodoItems } from '../../steps/foreach-item-config'
import { forEachItemWithExpression } from '../../steps/foreach-item-run'
import type {
  AgentFlowDsl,
  DslConditional,
  DslExpression,
  DslForEach,
  DslStageEntry,
} from './schema'

export type CompiledDsl = {
  pipeline: PipelineEntry[]
  conditionals: FlowConditionalBranch[]
}

/**
 * Compile a JSON DSL definition into runtime pipeline entries and conditional branches.
 * The compiled output can be fed directly into `AgentFlow.fromDsl()`.
 */
export function compileDsl(dsl: AgentFlowDsl): CompiledDsl {
  const pipeline = dsl.pipeline.map(compileStageEntry)
  const conditionals = (dsl.conditionals ?? []).map(compileConditional)
  return { pipeline, conditionals }
}

function compileStageEntry(entry: DslStageEntry): PipelineEntry {
  const id = entry.stage as FlowStageId
  const config = buildStageConfig(entry)
  const when = entry.precondition
    ? resolveStepWhenCondition(entry.precondition)
    : undefined

  const runner =
    id === SUB_FLOW_STEP_ID
      ? subFlowFlowStepDefinition
      : id === SEARCH_STEP_ID
        ? searchFlowStepDefinition
        : id === WEB_SCRAPE_STEP_ID
          ? webScrapeFlowStepDefinition
          : id === CREATE_PAPER_STEP_ID
            ? createPaperFlowStepDefinition
            : undefined

  return { id, config, ...(runner ? { runner } : {}), ...(when ? { when } : {}) }
}

function buildStageConfig(entry: DslStageEntry): FlowStepConfig | undefined {
  if (entry.stage === SUB_FLOW_STEP_ID && entry.subFlow) {
    return { subFlow: entry.subFlow }
  }

  if (entry.stage === SEARCH_STEP_ID && entry.search) {
    return { search: entry.search }
  }

  if (entry.stage === WEB_SCRAPE_STEP_ID) {
    return { webScrape: entry.webScrape ?? {} }
  }

  if (entry.stage === CREATE_PAPER_STEP_ID) {
    return { createPaper: entry.createPaper ?? {} }
  }

  if (entry.stage === FOREACH_ITEM_STEP_ID && entry.forEach) {
    return buildForEachConfig(entry.forEach)
  }

  if (!entry.expression && !entry.title) return undefined

  const plan = entry.expression ? compileExpression(entry.expression) : undefined
  const config: FlowStepConfig = {}

  if (plan) {
    config.expressionPlan = plan
    if (plan.instructions) {
      config.systemMessage = plan.instructions
      config.instructions = plan.instructions
    }
    if (plan.userPrompt) {
      config.userPrompt = plan.userPrompt
    }
    const stepTools = [plan.tool, plan.elseTool].filter(
      (t): t is string => Boolean(t?.trim()),
    )
    if (stepTools.length > 0) {
      config.stepTools = stepTools
    }
    if (plan.elseTool) {
      config.elseTool = plan.elseTool
    }
    if (plan.elseGoto) {
      config.elseGoto = plan.elseGoto
    }
  }

  if (entry.title || plan?.title) {
    config.title = entry.title ?? plan?.title
  }

  return Object.keys(config).length > 0 ? config : undefined
}

function buildForEachConfig(forEach: DslForEach): FlowStepConfig {
  if (forEach.expression) {
    const plan = compileExpression(forEach.expression)
    return forEachItemWithExpression({
      itemsFrom: defaultPlanningTodoItems,
      expression: plan,
      startIndex: forEach.startIndex,
    })
  }

  return {
    foreachItem: {
      preset: forEach.preset ?? 'hasTodoItems',
      ...(forEach.startIndex !== undefined ? { startIndex: forEach.startIndex } : {}),
      ...(forEach.maxItems !== undefined ? { maxItems: forEach.maxItems } : {}),
      ...(forEach.maxChars !== undefined ? { maxChars: forEach.maxChars } : {}),
    },
  }
}

function compileExpression(expr: DslExpression): StepExpressionPlan {
  const plan: StepExpressionPlan = {}

  if (expr.system_msg) plan.instructions = expr.system_msg
  if (expr.prompt) plan.userPrompt = expr.prompt
  if (expr.title) plan.title = expr.title
  if (expr.tool) plan.tool = expr.tool
  if (expr.else_tool) plan.elseTool = expr.else_tool
  if (expr.else_goto) plan.elseGoto = expr.else_goto as FlowStageId

  if (expr.precondition) {
    plan.precondition = resolveStepWhenCondition(expr.precondition)
  }
  if (expr.when) {
    plan.whenHarness = resolveWhenHarnessCondition(expr.when)
  }

  return plan
}

function compileConditional(cond: DslConditional): FlowConditionalBranch {
  return {
    afterLinearIndex: cond.afterStage,
    when: resolveStepWhenCondition(cond.when),
    then: cond.then.map(compileStageEntry),
    else: cond.else.map(compileStageEntry),
  }
}

/** Validate that a raw JSON object conforms to the DSL schema (basic structural checks). */
export function validateDsl(raw: unknown): asserts raw is AgentFlowDsl {
  if (!raw || typeof raw !== 'object') {
    throw new DslValidationError('DSL must be a non-null object')
  }
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.pipeline)) {
    throw new DslValidationError('DSL must have a "pipeline" array')
  }

  const validStages: Set<string> = new Set([
    THINKING_STEP_ID,
    PLANNING_STEP_ID,
    TOOL_LOOP_STEP_ID,
    SUMMARY_STEP_ID,
    REPORT_STEP_ID,
    PROMPT_STEP_ID,
    FOREACH_ITEM_STEP_ID,
    SUB_FLOW_STEP_ID,
    SEARCH_STEP_ID,
    WEB_SCRAPE_STEP_ID,
    CREATE_PAPER_STEP_ID,
  ])

  for (let i = 0; i < obj.pipeline.length; i++) {
    const entry = obj.pipeline[i] as Record<string, unknown> | undefined
    if (!entry || typeof entry !== 'object') {
      throw new DslValidationError(`pipeline[${i}] must be an object`)
    }
    if (typeof entry.stage !== 'string' || !validStages.has(entry.stage)) {
      throw new DslValidationError(
        `pipeline[${i}].stage must be one of: ${[...validStages].join(', ')}`,
      )
    }
  }

  if (obj.conditionals !== undefined) {
    if (!Array.isArray(obj.conditionals)) {
      throw new DslValidationError('"conditionals" must be an array if present')
    }
    for (let i = 0; i < obj.conditionals.length; i++) {
      const cond = obj.conditionals[i] as Record<string, unknown> | undefined
      if (!cond || typeof cond !== 'object') {
        throw new DslValidationError(`conditionals[${i}] must be an object`)
      }
      if (typeof cond.afterStage !== 'number') {
        throw new DslValidationError(`conditionals[${i}].afterStage must be a number`)
      }
      if (typeof cond.when !== 'string') {
        throw new DslValidationError(`conditionals[${i}].when must be a preset string`)
      }
      if (!Array.isArray(cond.then)) {
        throw new DslValidationError(`conditionals[${i}].then must be an array`)
      }
      if (!Array.isArray(cond.else)) {
        throw new DslValidationError(`conditionals[${i}].else must be an array`)
      }
    }
  }
}

export class DslValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DslValidationError'
  }
}
