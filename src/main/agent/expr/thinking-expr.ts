import type {
  AgentMessage,
  AssistantSubStep,
  StepRunCapture,
  ThinkingResult,
} from '../types'
import type { AgentStepContext } from '../context'
import type { StepExpression } from './step-expression'
import { StepExpressionDefinitionBase } from './step-expr-base'
import type {
  StepExpressionDefinition,
  StepRunContext,
} from '../flow/step-hook'
import { THINKING_STEP_ID, THINKING_STEP_TITLE } from '../constants/step-ids'
import type { PipelineEntry } from '../flow/pipeline'
import { buildPipelineEntry } from '../flow/pipeline-entry'
import type { StepOutputEntry, ThinkingStepData } from '../steps/step-io'
import { PIPELINE_CONTEXT_LLM } from '../constants'
import { Output } from '@openfde-ai'
import { z } from 'zod'
import { runExpressionLlmObject } from './run-expression-llm'
import type { StepExpressionPlan } from './expression-plan'
import {
  formatThinkingMarkdown,
  normalizeThinkingOutput,
  type LooseThinkingOutput,
  type NormalizedThinkingOutput,
} from '../utils/thinking-parse'
import { runThinkingResearchPass } from './thinking-tool-loop'
import { correctMisroutedThinking, agentHasRunnableTools } from './thinking-route-guard'
import {
  bootstrapPlanModeStorage,
  isPlanExecutionActive,
  isPlanModeActive,
  planModeFor,
  planModeStorageOptionsFromEnv,
} from '../coding/plan-mode-state'
import { isSubAgentAgentRun } from '../run/sub-agent-run-policy'
export {
  latestThinkingStepData,
  thinkingWantsAgentCall,
  thinkingWantsDirectAnswer,
  thinkingWantsPlanning,
  thinkingWantsResearch,
} from './thinking-utils'

import { truncateString } from '../utils/str-utils'
import {
  DIAGRAM_DIRECT_ANSWER_RETRY_HINT,
  DIAGRAM_THINKING_ROUTING_HINT,
} from '@shared/agent/diagram-output-instructions'
import { downgradeAgentCallForInlineDiagram } from './thinking-route-guard'

const thinkingRouterSchema = z.object({
  execution_mode: z
    .enum(['planning', 'agent_call', 'direct_answer'])
    .describe(
      'Use direct_answer ONLY for pure Q&A with no code/env changes. Default to agent_call when the user wants something done. Use planning for multi-step work needing approval.',
    ),
  goal: z.string().describe('One sentence — overall user intent'),
  task: z.string().describe('One sentence — what they want now (no solutions)'),
  context: z
    .array(z.string())
    .max(3)
    .describe('Up to 3 critical facts from prior turns; use [] if none'),
  rationale: z
    .string()
    .describe(
      'One short sentence on constraints or approach; use empty string when nothing to add beyond goal/task',
    ),
  response: z
    .string()
    .describe(
      'Full user-facing answer when execution_mode is direct_answer; empty string otherwise',
    ),
})

const thinkingRouterOutputSpec = (Output.object as any)({
  schema: thinkingRouterSchema,
})

const THINKING_LLM = {
  MAX_OUTPUT_TOKENS: 800,
  SYSTEM_INSTRUCTIONS: `You are a **fast intent router** before the agent executes. Elaborate what the user really wants and choose how the pipeline should proceed.

Routing rules:
1. Always fill goal, task, and context — translate the user's request into language the next step can act on.
2. Choose execution_mode:
   - planning — work spans multiple steps, touches many files, or needs a plan + approval before changes.
   - agent_call — user wants files edited, commands run, data exported to disk, or work that cannot be answered as markdown alone. **Not** for inline plot/chart images — use direct_answer + \`\`\`diagram\` instead.
   - direct_answer — pure informational Q&A and **explain/plot/visualize** math or simple diagrams; put prose plus any \`\`\`diagram\` fence in \`response\` (no tools).
3. When execution_mode is direct_answer, write the complete answer in response (not just routing metadata). Otherwise set response to "".
4. Always include rationale; use "" when there is nothing meaningful to add beyond goal/task.
5. Do not ask the user questions. If details are missing, state reasonable assumptions in goal/task/context.
6. **When uncertain, prefer agent_call over direct_answer** — except for explain/plot/graph/visualize requests that need only prose + a built-in \`\`\`diagram\` block (use direct_answer).
7. Never use direct_answer when the user delegates work ("please fix", "can you implement", "help me build", "go ahead and …").`,
  RESEARCH_CONTEXT_HEADER: 'Read-only research summary (for routing only):',
  ADDITIONAL_CONFIG_HEADER: 'Additional instructions:',
} as const

const THINKING_STEP_GOAL =
  'Elaborate user intent and route to explore mode, tool execution, or a direct answer.'
const THINKING_STEP_OUTCOME =
  'Prepared execution routing and intent for the pipeline.'

const THINKING_MAX_HISTORY_MESSAGES = 8
const THINKING_MAX_CHARS_PER_MESSAGE = 1_200

function buildThinkingInstructions(
  extraThinkingConfig?: string,
  planModeAlreadyActive = false,
  toolsEnabled = false,
): string {
  const extra = extraThinkingConfig?.trim()
  const planModeRule = planModeAlreadyActive
    ? '\n\nExplore mode is already active for this conversation. Always set execution_mode to "planning". Do not use agent_call or direct_answer.'
    : ''
  const toolsRule = toolsEnabled
    ? '\n\nThis agent has tools enabled. Use direct_answer for purely informational questions and for explain/plot/visualize requests that you can answer with markdown plus a ```diagram``` fence — do not use agent_call or run_script just to draw a chart. Use agent_call when the user needs sandbox file changes, exports, or other tool work.'
    : ''
  return `${THINKING_LLM.SYSTEM_INSTRUCTIONS}${planModeRule}${toolsRule}\n\n${DIAGRAM_THINKING_ROUTING_HINT}${
    extra ? `\n\n---\n${THINKING_LLM.ADDITIONAL_CONFIG_HEADER}\n${extra}` : ''
  }`
}

function thinkingDataFromNormalized(
  formatted: string,
  thinking: NormalizedThinkingOutput,
): ThinkingStepData {
  return {
    raw: formatted,
    rendered: formatted,
    execution_mode: thinking.execution_mode,
    goal: thinking.goal,
    task: thinking.task,
    context: thinking.context,
    ...(thinking.rationale ? { rationale: thinking.rationale } : {}),
    ...(thinking.response ? { response: thinking.response } : {}),
  }
}

function thinkingResultFromData(data: ThinkingStepData): ThinkingResult {
  return {
    raw: data.raw,
    execution_mode: data.execution_mode,
    goal: data.goal,
    task: data.task,
    context: data.context,
    rationale: data.rationale,
    response: data.response,
  }
}

async function runThinkingRouterLlm(
  ctx: AgentStepContext,
  plan: StepExpressionPlan,
  messages: AgentMessage[],
  llmOptions?: { maxOutputTokens?: number },
): Promise<NormalizedThinkingOutput> {
  const parsed = await runExpressionLlmObject<LooseThinkingOutput>(
    ctx,
    plan,
    messages,
    {
      output: thinkingRouterOutputSpec,
      maxOutputTokens: llmOptions?.maxOutputTokens,
      streamToProgress: true,
      stage: 'explore',
    },
  )
  return normalizeThinkingOutput(parsed)
}

function normalizeThinkingForConversation(
  ctx: AgentStepContext,
  thinking: NormalizedThinkingOutput,
): NormalizedThinkingOutput {
  if (isSubAgentAgentRun(ctx)) return thinking
  const conversationId = ctx.opts.conversationId?.trim()
  if (!conversationId || !isPlanModeActive(conversationId)) return thinking
  return {
    ...thinking,
    execution_mode: 'planning',
    response: undefined,
  }
}

/** Sub-agents always execute via tool loop — no explore/plan routing or direct_answer short-circuit. */
function normalizeThinkingForSubAgentRun(
  ctx: AgentStepContext,
  thinking: NormalizedThinkingOutput,
): NormalizedThinkingOutput {
  if (!isSubAgentAgentRun(ctx)) return thinking
  return {
    ...thinking,
    execution_mode: 'agent_call',
    response: undefined,
  }
}

function applyThinkingRouteSideEffects(
  ctx: AgentStepContext,
  thinking: NormalizedThinkingOutput,
): void {
  if (isSubAgentAgentRun(ctx)) return
  const conversationId = ctx.opts.conversationId?.trim()
  if (!conversationId) return

  if (
    thinking.execution_mode === 'planning' &&
    !isPlanModeActive(conversationId) &&
    !isPlanExecutionActive(conversationId)
  ) {
    planModeFor(conversationId).activatePlanning({
      trigger: 'thinking:route_planning',
    })
    const titleHint = thinking.task?.trim() || thinking.goal?.trim()
    bootstrapPlanModeStorage(
      conversationId,
      titleHint || undefined,
      planModeStorageOptionsFromEnv(conversationId),
    )
  }
}

class ThinkingStepDefinition extends StepExpressionDefinitionBase {
  readonly id = THINKING_STEP_ID
  readonly title = THINKING_STEP_TITLE

  protected executionStepPrompt(ctx: AgentStepContext): string | undefined {
    return ctx.executionSteps?.thinking
  }

  protected defaultInstruction(ctx: AgentStepContext): string {
    const conversationId = ctx.opts.conversationId?.trim()
    const planModeAlreadyActive = conversationId
      ? isPlanModeActive(conversationId)
      : false
    return buildThinkingInstructions(
      this.executionStepPrompt(ctx),
      planModeAlreadyActive,
      agentHasRunnableTools(ctx),
    )
  }

  buildMessages(ctx: AgentStepContext): AgentMessage[] {
    return ctx.currentMessages
      .slice(-THINKING_MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m.role,
        content: truncateString(m.content, THINKING_MAX_CHARS_PER_MESSAGE),
      }))
  }

  onStart(ctx: AgentStepContext, _plan: StepExpressionPlan): void {
    ctx.emitStepProgress(`\nAnalyzing request…\n`)
  }

  formatBody(body: string, _ctx: AgentStepContext): string {
    try {
      const thinking = normalizeThinkingOutput(JSON.parse(body) as LooseThinkingOutput)
      return formatThinkingMarkdown(thinking)
    } catch {
      return body.trim()
    }
  }

  llmOptions() {
    return { maxOutputTokens: THINKING_LLM.MAX_OUTPUT_TOKENS }
  }

  stepGoal(): string {
    return THINKING_STEP_GOAL
  }

  get outcome(): string {
    return THINKING_STEP_OUTCOME
  }

  async execute(ctx: AgentStepContext): Promise<void> {
    const plan = this.buildPlan(ctx)
    const displayTitle = plan.title?.trim() || this.title
    const stepGoal = this.stepGoal()

    ctx.beginStep(this.id, displayTitle, undefined, stepGoal)
    await this.onStart(ctx, plan)

    const researchSummary = await runThinkingResearchPass(ctx)
    const baseMessages = this.buildMessages(ctx)
    const routerMessages: AgentMessage[] = researchSummary
      ? [
          ...baseMessages,
          {
            role: 'user',
            content: `${THINKING_LLM.RESEARCH_CONTEXT_HEADER}\n\n${researchSummary}`,
          },
        ]
      : baseMessages

    let thinking = await runThinkingRouterLlm(
      ctx,
      plan,
      routerMessages,
      this.llmOptions(),
    )
    const userMessage = ctx.getLatestUserMessageContent()
    const routeBeforeDowngrade = thinking.execution_mode
    thinking = downgradeAgentCallForInlineDiagram(thinking, userMessage)
    if (
      routeBeforeDowngrade === 'agent_call' &&
      thinking.execution_mode === 'direct_answer' &&
      !thinking.response?.trim()
    ) {
      thinking = await runThinkingRouterLlm(
        ctx,
        plan,
        [
          ...routerMessages,
          { role: 'user', content: DIAGRAM_DIRECT_ANSWER_RETRY_HINT },
        ],
        this.llmOptions(),
      )
    }
    thinking = correctMisroutedThinking(
      thinking,
      userMessage,
      { toolsEnabled: agentHasRunnableTools(ctx) },
    )
    thinking = normalizeThinkingForSubAgentRun(ctx, thinking)
    thinking = normalizeThinkingForConversation(ctx, thinking)
    applyThinkingRouteSideEffects(ctx, thinking)

    const formatted = formatThinkingMarkdown(thinking)
    const data = thinkingDataFromNormalized(formatted, thinking)
    const result = thinkingResultFromData(data)

    ctx.recordStepOutput(
      this.id,
      displayTitle,
      result,
      formatted,
      undefined,
      stepGoal,
      this.outcome,
    )

    if (thinking.execution_mode === 'direct_answer' && thinking.response?.trim()) {
      ctx.appendAssistantTurn(thinking.response.trim())
    } else if (formatted.trim()) {
      ctx.appendAssistantTurn(formatted)
    }
  }

  toContextMessages(entries: StepOutputEntry[]): AgentMessage[] {
    const last = entries[entries.length - 1]?.data as
      | ThinkingStepData
      | undefined
    const raw = last?.raw?.trim()
    if (!raw) return []
    return [
      { role: 'user', content: `${PIPELINE_CONTEXT_LLM.THINKING}\n\n${raw}` },
    ]
  }

  toSubStep(entries: StepOutputEntry[]): AssistantSubStep | null {
    const last = entries[entries.length - 1]?.data as
      | ThinkingStepData
      | undefined
    const raw = last?.raw?.trim()
    if (!raw) return null
    return { type: 'ThinkingStep', title: 'Thinking', content: raw }
  }

  toStepCapture(entries: StepOutputEntry[]): StepRunCapture | null {
    const last = entries[entries.length - 1]?.data as
      | ThinkingStepData
      | undefined
    const raw = last?.raw?.trim()
    if (!raw) return null
    return {
      stepType: 'ThinkingStep',
      title: 'Thinking',
      content: raw,
      outputPaths: [],
    }
  }

  hasOutput(entries: StepOutputEntry[]): boolean {
    const last = entries[entries.length - 1]?.data as
      | ThinkingStepData
      | undefined
    return Boolean(last?.raw?.trim() || last?.goal?.trim())
  }
}

/** Built-in thinking pipeline stage ({@link AgentFlow.thinking}). */
export const thinkingFlowStepDefinition: StepExpressionDefinition =
  new ThinkingStepDefinition()

/** Pipeline row for thinking: expression config + {@link thinkingFlowStepDefinition} (no registry preload). */
export function buildThinkingPipelineEntry(
  input?: StepExpression,
): PipelineEntry {
  return buildPipelineEntry(
    THINKING_STEP_ID,
    thinkingFlowStepDefinition,
    input ?? undefined,
  )
}
