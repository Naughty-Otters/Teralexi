import type { AgentFlowContext } from '../context'
import { patchPendingExecutionPausedStage } from '../steps/pending-state'
import { stageIdForPipelineLookup } from '../run/flow-scoped-ids'
import type { FlowStepPromptOverrides } from './step-prompts'
import type { FlowStageId } from '../constants/step-ids'
import type { ForEachItemConfig } from '../steps/foreach-item-config'
import type { SubFlowConfig } from '../steps/sub-flow-config'
import type { SearchConfig } from '../steps/search-config'
import type { WebScrapeConfig } from '../steps/web-scrape-config'
import type { StepExpressionPlan } from '../expr/expression-plan'
import type { StepExpressionDefinition } from './step-hook'
import { createLogger } from '@logging/main-logger'
export type { StepExpressionDefinition as StepHook, StepRunContext, StepAfterHook } from './step-hook'

export type { FlowStageId } from '../constants/step-ids'
export { FLOW_PIPELINE_STEP_IDS } from '../constants/step-ids'

export type ToolLoopRunOptions = {
  resumeTodoIndex?: number
}

const log = createLogger('flow.pipeline')

/** Per-step runtime config passed through the fluent API / dynamic builders. */
export type FlowStepConfig = Record<string, unknown> &
  FlowStepPromptOverrides & {
    toolLoopRun?: ToolLoopRunOptions
    /** Display title for {@link PROMPT_STEP_ID} / {@link AgentFlow.customStep}. */
    title?: string
    /** Tool ids allowed for this tool-loop stage (from {@link StepExpression.tool}). */
    stepTools?: string[]
    /** Tool when expression `when` harness fails (from {@link StepExpression.else_tool}). */
    elseTool?: string
    /** Pipeline stage when harness fails (from {@link StepExpression.else_goto}). */
    elseGoto?: FlowStageId
    /** User prompt for expression LLM calls (from {@link StepExpression.prompt}). */
    userPrompt?: string
    /** Full expression pipeline (LLM → when → tools → verify). */
    expressionPlan?: StepExpressionPlan
    /** Iterate items from a prior stage; see {@link ForEachItemOrchestrator}. */
    foreachItem?: ForEachItemConfig
    /** Nested {@link AgentRun} via another catalog agent. */
    subFlow?: SubFlowConfig
    /** Web search (SERP only, no scraping) via {@link SearchOrchestrator}. */
    search?: SearchConfig
    /** Scrape prior search hits to markdown under {@link WEB_SCRAPE_STEP_ID}/output/. */
    webScrape?: WebScrapeConfig
    /** Synthesize a paper from search + scraped sources ({@link CreatePaperOrchestrator}). */
    createPaper?: import('../steps/create-paper-config').CreatePaperConfig
  }

export type PipelineEntry = {
  id: FlowStageId
  config?: FlowStepConfig
  /** Skip this entry when false (evaluated at execute time). */
  when?: (ctx: AgentFlowContext) => boolean
  /** Runner from fluent API (e.g. {@link buildThinkingPipelineEntry}); registry is optional fallback. */
  runner?: StepExpressionDefinition
}

function runCtx(
  flow: AgentFlowContext,
  config: FlowStepConfig = {},
) {
  return { flow, config }
}

function entryShouldRun(
  entry: PipelineEntry,
  ctx: AgentFlowContext,
): boolean {
  if (entry.when && !entry.when(ctx)) return false
  return true
}

export class FlowPipelineRegistry {
  private readonly steps = new Map<FlowStageId, StepExpressionDefinition>()

  constructor(definitions: StepExpressionDefinition[] = []) {
    for (const def of definitions) {
      this.steps.set(def.id, def)
    }
  }

  get(id: FlowStageId): StepExpressionDefinition | undefined {
    return this.steps.get(id)
  }

  register(definition: StepExpressionDefinition): void {
    this.steps.set(definition.id, definition)
  }

  ids(): FlowStageId[] {
    return [...this.steps.keys()]
  }
}

/** Inserted after `afterLinearIndex` linear stages; evaluated when that point is reached. */
export type FlowConditionalBranch = {
  /** Number of {@link PipelineEntry} rows registered on the flow before `when()` was called. */
  afterLinearIndex: number
  when: (ctx: AgentFlowContext) => boolean
  then: PipelineEntry[]
  else: PipelineEntry[]
}

/**
 * Yields linear stages with conditional branches at their registration point.
 * Branch predicates use `getCtx()` at reach time (so planning output is visible).
 */
export function* iterateResolvedPipelineEntries(
  linear: readonly PipelineEntry[],
  branches: readonly FlowConditionalBranch[],
  getCtx: () => AgentFlowContext,
): Generator<PipelineEntry> {
  const sorted = [...branches].sort(
    (a, b) => a.afterLinearIndex - b.afterLinearIndex,
  )
  let bi = 0

  for (let li = 0; li < linear.length; li++) {
    while (bi < sorted.length && sorted[bi].afterLinearIndex === li) {
      const branch = sorted[bi++]!
      const picked = branch.when(getCtx()) ? branch.then : branch.else
      yield* picked
    }
    yield linear[li]!
  }

  while (bi < sorted.length && sorted[bi].afterLinearIndex === linear.length) {
    const branch = sorted[bi++]!
    const picked = branch.when(getCtx()) ? branch.then : branch.else
    yield* picked
  }
}

export function resolvedPipelineStageIds(
  linear: readonly PipelineEntry[],
  branches: readonly FlowConditionalBranch[],
  ctx: AgentFlowContext,
): FlowStageId[] {
  return [
    ...iterateResolvedPipelineEntries(linear, branches, () => ctx),
  ]
    .filter((entry) => !entry.when || entry.when(ctx))
    .map((entry) => entry.id)
}

export type ExecutePipelineParams = {
  ctx: AgentFlowContext
  linear: PipelineEntry[]
  conditionalBranches?: FlowConditionalBranch[]
  registry: FlowPipelineRegistry
  returnIfHitlPaused: () => string | null
  /** Resume execution from this resolved-entry index (skipping earlier stages). */
  startIndex?: number
  /** Resume execution from this stage id (scoped `flowId:stageId` or legacy unscoped). */
  startFromStageId?: FlowStageId | string
}

const MAX_PIPELINE_GOTO_JUMPS = 64

export function findPipelineEntryIndexByStageId(
  entries: readonly PipelineEntry[],
  stageIdOrScoped: FlowStageId | string,
  currentFlowId?: string,
): number {
  const stageId = stageIdForPipelineLookup(stageIdOrScoped, currentFlowId)
  if (!stageId) return -1
  return entries.findIndex((entry) => entry.id === stageId)
}

/** Extend resolved entries by pulling from the generator (evaluates branches at reach time). */
function ensureResolvedEntriesThrough(
  gen: Generator<PipelineEntry, void, unknown>,
  entries: PipelineEntry[],
  targetLength: number,
): void {
  while (entries.length < targetLength) {
    const next = gen.next()
    if (next.done) return
    entries.push(next.value)
  }
}

/** Resolve forward until `stageId` appears (for resume / else_goto to a later stage). */
function resolveUntilStageId(
  gen: Generator<PipelineEntry, void, unknown>,
  entries: PipelineEntry[],
  stageIdOrScoped: FlowStageId | string,
  currentFlowId?: string,
): number {
  let idx = findPipelineEntryIndexByStageId(entries, stageIdOrScoped, currentFlowId)
  while (idx < 0) {
    const next = gen.next()
    if (next.done) return -1
    entries.push(next.value)
    idx = findPipelineEntryIndexByStageId(entries, stageIdOrScoped, currentFlowId)
  }
  return idx
}

export async function executeFlowPipeline(
  params: ExecutePipelineParams,
): Promise<string> {
  const {
    ctx,
    linear,
    conditionalBranches = [],
    registry,
    returnIfHitlPaused,
    startIndex: resumeFrom,
    startFromStageId,
  } = params

  const gen = iterateResolvedPipelineEntries(
    linear,
    conditionalBranches,
    () => ctx,
  )
  const entries: PipelineEntry[] = []

  if (linear.length === 0 && conditionalBranches.length === 0) {
    return ctx.buildStructuredAssistantContent()
  }

  let index: number
  if (startFromStageId) {
    const found = resolveUntilStageId(gen, entries, startFromStageId, ctx.flowId)
    index = found >= 0 ? found : 0
  } else {
    index = resumeFrom ?? 0
    if (index > 0) {
      ensureResolvedEntriesThrough(gen, entries, index + 1)
    }
  }
  let gotoJumps = 0

  while (true) {
    ensureResolvedEntriesThrough(gen, entries, index + 1)
    if (index >= entries.length) break

    const entry = entries[index]!
    index += 1

    if (!entryShouldRun(entry, ctx)) {
      continue
    }

    const def = entry.runner ?? registry.get(entry.id)
    if (!def) {
      throw new Error(`Unknown flow stage: ${entry.id}`)
    }

    const run = runCtx(ctx, entry.config ?? {})
    if (def.shouldRun && !def.shouldRun(run)) {
      continue
    }

    await def.run(run)

    const gotoStageId = ctx.consumePipelineGoto()
    if (gotoStageId) {
      const targetIndex = resolveUntilStageId(gen, entries, gotoStageId, ctx.flowId)
      if (targetIndex < 0) {
        throw new Error(`else_goto target not found in pipeline: ${gotoStageId}`)
      }
      gotoJumps += 1
      if (gotoJumps > MAX_PIPELINE_GOTO_JUMPS) {
        throw new Error(
          `Pipeline goto limit exceeded (last target: ${gotoStageId})`,
        )
      }
      index = targetIndex
      continue
    }

    if (def.after) {
      const early = await def.after(run)
      if (early !== null) return early
    }

    if (def.hitlPausePoint) {
      const hitl = returnIfHitlPaused()
      if (hitl !== null) {
        ctx.setHitlPausedAtStage(entry.id)
        patchPendingExecutionPausedStage(
          ctx.opts.conversationId,
          ctx.opts.assistantMessageId,
          ctx.lastHitlPausedStageId,
        )
        return hitl
      }
    }

    if (!def && !gotoStageId) {
      // run into the situation that no definition no target id to go. 
      log.warn('No definition no target id to go. Pipeline will end.');
      break;
    }
  }

  return ctx.buildStructuredAssistantContent()
}
