import type { AgentMessage } from '../types'
import type { FlowStageId } from '../constants/step-ids'
import type { StepAfterHook, StepExpressionDefinition, StepRunContext } from '../flow/step-hook'
import {
  resolveFlowStepInstructions,
  resolveFlowStepSystem,
} from '../flow/step-prompts'
import { mergeExpressionPlans } from './merge-expression-plans'
import type { StepExpressionPlan } from './expression-plan'
import type { RunExpressionLlmOptions } from './run-expression-llm'
import type { AgentStepContext } from '../context'
import { runResolvedExpressionStep } from './run-step-hook-expression'
import type { StepHookResult } from './step-hook-types'

export type ResolvedStepPrompts = {
  instructions: string
  userPrompt: string
}

/** Resolved expression hooks used by the LLM pass runner (all methods defined). */
export type ResolvedExpressionDefinition = {
  id: FlowStageId
  title: string
  shouldRun: (run: StepRunContext) => boolean
  buildPlan: (ctx: AgentStepContext) => StepExpressionPlan
  buildMessages: (ctx: AgentStepContext) => AgentMessage[]
  onStart: (ctx: AgentStepContext, plan: StepExpressionPlan) => void | Promise<void>
  formatBody: (body: string, ctx: AgentStepContext) => string
  recordResult: (ctx: AgentStepContext, result: StepHookResult) => void
  resolveLlmOptions: (
    ctx: AgentStepContext,
    plan: StepExpressionPlan,
  ) => RunExpressionLlmOptions | undefined
  resolveStepGoal: (ctx: AgentStepContext) => string | undefined
  outcome: string | undefined
  execute: (ctx: AgentStepContext) => Promise<void>
  after: StepAfterHook | undefined
}

/**
 * Base for expression LLM pipeline stages. Implements {@link StepExpressionDefinition}; subclasses set
 * {@link id} and {@link title}, override {@link buildInstruction} / {@link buildUserPrompt}
 * (or {@link defaultInstruction} / {@link defaultUserPrompt}) as needed.
 */
export abstract class StepExpressionDefinitionBase implements StepExpressionDefinition {
  abstract readonly id: FlowStageId
  abstract readonly title: string

  hitlPausePoint?: boolean

  shouldRun(_run: StepRunContext): boolean {
    return true
  }

  /** Stage default system instructions before fluent / flow-step overrides. */
  protected defaultInstruction(_ctx: AgentStepContext): string {
    return ''
  }

  /** Stage default user prompt before fluent / flow-step overrides. */
  protected defaultUserPrompt(_ctx: AgentStepContext): string {
    return ''
  }

  /** Resolved system instructions (flow-step + response language + {@link defaultInstruction}). */
  buildInstruction(ctx: AgentStepContext): string {
    return resolveFlowStepSystem(
      ctx.flowStepConfig,
      ctx.config,
      this.defaultInstruction(ctx),
      ctx.opts.responseLanguage,
    )
  }

  /** Resolved user prompt (flow-step / legacy instructions, then fluent merge). */
  buildUserPrompt(ctx: AgentStepContext): string {
    return resolveFlowStepInstructions(
      ctx.flowStepConfig,
      this.defaultUserPrompt(ctx),
    )
  }

  /** Default plan: {@link buildInstruction} + {@link buildUserPrompt}, then fluent merge. */
  protected resolveStep(ctx: AgentStepContext): ResolvedStepPrompts {
    return {
      instructions: this.buildInstruction(ctx),
      userPrompt: this.buildUserPrompt(ctx),
    }
  }

  /** Display title merged into the expression plan (override for custom prompt, etc.). */
  protected resolvePlanTitle(_ctx: AgentStepContext): string {
    return this.title
  }

  buildPlan(ctx: AgentStepContext): StepExpressionPlan {
    const resolved = this.resolveStep(ctx)
    const title = this.resolvePlanTitle(ctx)
    return this.mergeExpressionPlan(
      {
        instructions: resolved.instructions,
        userPrompt: resolved.userPrompt,
        title,
      },
      ctx,
      title,
    )
  }

  /** Merge fluent {@link StepExpressionPlan} overrides; optional default stage title. */
  protected mergeExpressionPlan(
    defaults: StepExpressionPlan,
    ctx: AgentStepContext,
    defaultTitle?: string,
  ): StepExpressionPlan {
    const merged = mergeExpressionPlans(defaults, ctx.flowStepConfig?.expressionPlan)
    if (!defaultTitle) return merged
    return { ...merged, title: merged.title ?? defaultTitle }
  }

  buildMessages(ctx: AgentStepContext): AgentMessage[] {
    return ctx.currentMessages
  }

  onStart(_ctx: AgentStepContext, _plan: StepExpressionPlan): void | Promise<void> {}

  formatBody(body: string, _ctx: AgentStepContext): string {
    return body.trim()
  }

  recordResult(ctx: AgentStepContext, result: StepHookResult): void {
    ctx.recordStepOutput(
      this.id,
      result.displayTitle,
      { raw: result.formatted },
      result.formatted,
      undefined,
      result.stepGoal,
      this.outcome,
    )
    if (result.formatted.trim()) {
      ctx.appendAssistantTurn(result.formatted)
    }
  }

  llmOptions(
    _ctx: AgentStepContext,
    _plan: StepExpressionPlan,
  ): RunExpressionLlmOptions | undefined {
    return undefined
  }

  stepGoal(_ctx: AgentStepContext): string | undefined {
    return undefined
  }

  get outcome(): string | undefined {
    return undefined
  }

  async execute(ctx: AgentStepContext): Promise<void> {
    await runResolvedExpressionStep(ctx, this.resolveExpression())
  }

  get after(): StepAfterHook | undefined {
    return undefined
  }

  async run(run: StepRunContext): Promise<void> {
    const displayTitle =
      run.config.expressionPlan?.title?.trim() ||
      run.config.title?.trim() ||
      this.title
    const stepCtx = run.flow.createStepContext(this.id, displayTitle, run.config)
    await this.execute(stepCtx)
  }

  resolveExpression(): ResolvedExpressionDefinition {
    return {
      id: this.id,
      title: this.title,
      shouldRun: (run) => this.shouldRun(run),
      buildPlan: (ctx) => this.buildPlan(ctx),
      buildMessages: (ctx) => this.buildMessages(ctx),
      onStart: (ctx, plan) => this.onStart(ctx, plan),
      formatBody: (body, ctx) => this.formatBody(body, ctx),
      recordResult: (ctx, result) => this.recordResult(ctx, result),
      resolveLlmOptions: (ctx, plan) => this.llmOptions(ctx, plan),
      resolveStepGoal: (ctx) => this.stepGoal(ctx),
      outcome: this.outcome,
      execute: (ctx) => this.execute(ctx),
      after: this.after,
    }
  }
}

function resolvePlainExpressionHooks(hooks: ExpressionStepDefinition): ResolvedExpressionDefinition {
  const resolved: ResolvedExpressionDefinition = {
    id: hooks.id,
    title: hooks.title,
    shouldRun: hooks.shouldRun ?? (() => true),
    buildPlan: hooks.buildPlan,
    buildMessages: (ctx) => hooks.buildMessages?.(ctx) ?? ctx.currentMessages,
    onStart: (ctx, plan) => hooks.onStart?.(ctx, plan),
    formatBody: (body, ctx) => hooks.formatBody?.(body, ctx) ?? body.trim(),
    recordResult: (ctx, result) => {
      if (hooks.recordResult) {
        hooks.recordResult(ctx, result)
        return
      }
      ctx.recordStepOutput(
        hooks.id,
        result.displayTitle,
        { raw: result.formatted },
        result.formatted,
        undefined,
        result.stepGoal,
        hooks.outcome,
      )
      if (result.formatted.trim()) {
        ctx.appendAssistantTurn(result.formatted)
      }
    },
    resolveLlmOptions: (ctx, plan) => {
      if (!hooks.llmOptions) return undefined
      return typeof hooks.llmOptions === 'function'
        ? hooks.llmOptions(ctx, plan)
        : hooks.llmOptions
    },
    resolveStepGoal: (ctx) => {
      if (typeof hooks.stepGoal === 'function') return hooks.stepGoal(ctx)
      return hooks.stepGoal
    },
    outcome: hooks.outcome,
    execute: undefined as unknown as ResolvedExpressionDefinition['execute'],
    after: hooks.after,
  }
  resolved.execute = hooks.execute
    ? (ctx) => hooks.execute!(ctx)
    : (ctx) => runResolvedExpressionStep(ctx, resolved)
  return resolved
}

/** Plain-object expression stage (converted to {@link StepExpressionDefinition} via {@link stepHookFromExpression}). */
export type ExpressionStepDefinition = {
  id: FlowStageId
  title: string
  shouldRun?: (run: StepRunContext) => boolean
  buildPlan: (ctx: AgentStepContext) => StepExpressionPlan
  buildMessages?: (ctx: AgentStepContext) => AgentMessage[]
  onStart?: (ctx: AgentStepContext, plan: StepExpressionPlan) => void | Promise<void>
  formatBody?: (body: string, ctx: AgentStepContext) => string
  recordResult?: (ctx: AgentStepContext, result: StepHookResult) => void
  llmOptions?:
    | RunExpressionLlmOptions
    | ((
        ctx: AgentStepContext,
        plan: StepExpressionPlan,
      ) => RunExpressionLlmOptions | undefined)
  stepGoal?: string | ((ctx: AgentStepContext) => string | undefined)
  outcome?: string
  execute?: (ctx: AgentStepContext) => Promise<void>
  after?: StepAfterHook
}

function stepHookFromResolvedExpression(resolved: ResolvedExpressionDefinition): StepExpressionDefinition {
  return {
    id: resolved.id,
    title: resolved.title,
    shouldRun: resolved.shouldRun,
    after: resolved.after,
    run: async (run) => {
      const displayTitle =
        run.config.expressionPlan?.title?.trim() ||
        run.config.title?.trim() ||
        resolved.title
      const stepCtx = run.flow.createStepContext(resolved.id, displayTitle, run.config)
      await resolved.execute(stepCtx)
    },
  }
}

/** Normalize class or plain-object expression hooks. */
export function resolveExpressionDefinitions(
  hooks: ExpressionStepDefinition | StepExpressionDefinitionBase,
): ResolvedExpressionDefinition {
  if (hooks instanceof StepExpressionDefinitionBase) {
    return hooks.resolveExpression()
  }
  return resolvePlainExpressionHooks(hooks)
}

/** {@link StepExpressionDefinition} from a class instance or plain expression hook object. */
export function stepHookFromExpression(
  hooks: ExpressionStepDefinition | StepExpressionDefinitionBase,
): StepExpressionDefinition {
  if (hooks instanceof StepExpressionDefinitionBase) {
    return hooks
  }
  return stepHookFromResolvedExpression(resolvePlainExpressionHooks(hooks))
}

/** Run one expression stage using a {@link StepExpressionDefinitionBase} or {@link ExpressionStepDefinition}. */
export async function executeExpressionStep(
  ctx: AgentStepContext,
  hooks: ExpressionStepDefinition | StepExpressionDefinitionBase,
): Promise<void> {
  const resolved = resolveExpressionDefinitions(hooks)
  await resolved.execute(ctx)
}
