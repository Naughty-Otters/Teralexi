import { jsonSchema, stepCountIs } from '@teralexi-ai'
import type { StreamTextParams, StreamTextResult } from '../llm/runtime'
import { resolveToolLoopMaxIterations } from '@shared/agent/tool-loop'
import { createLogger, instrumentInstanceMethods } from '@main/logger'
import type { AgentStepContext } from '../context'
import {
  callMcpToolDirect,
  callSkillToolDirect,
  filterToolsByAvailableSet,
  applyPerStreamToolInputDedupe,
  resolveToolPathNormalizeContextFromRunCtx,
  stepLog,
} from './step-helpers'
import { applyRunScopedReadCache } from '../expr/tool-read-cache'
import { applyReadFileLedgerGate } from '../expr/read-file-ledger-gate'
import { applySessionToolApprovals } from '../session-tool-approval'
import { applyCodingAgentPolicy } from '../coding/coding-agent-policy'
import { PLAN_MODE_TOOL_NAMES } from '@toolSet/planning'
import { INVOKE_AGENT_TOOL_NAME } from '@toolSet/sub-agents'
import { appendLinkedMarkdownReferenceSections } from './step-reference-link-expand'
import {
  resolveFlowStepInstructions,
  resolveFlowStepSystem,
} from '../flow/step-prompts'
import { STEP_ERRORS } from '../constants/pipeline'

export abstract class AgentStep {
  constructor(protected ctx: AgentStepContext) {
    instrumentInstanceMethods(
      this,
      createLogger(`agent.steps.${this.constructor.name || 'AgentStep'}`),
    )
  }

  shouldRun(): boolean {
    return true
  }

  abstract execute(): Promise<void>

  protected resolveFlowSystem(defaultSystem: string): string {
    return resolveFlowStepSystem(
      this.ctx.flowStepConfig,
      this.ctx.config,
      defaultSystem,
      this.ctx.opts.responseLanguage,
    )
  }

  protected resolveFlowInstructions(defaultInstructions: string): string {
    return resolveFlowStepInstructions(this.ctx.flowStepConfig, defaultInstructions)
  }

  protected async streamResultText(result: StreamTextResult) {
    for await (const chunk of result.textStream) {
      this.ctx.emitStepProgress(chunk)
    }
  }

  protected getFilteredRuntimeTools() {
    return filterToolsByAvailableSet(
      this.ctx.runtimeTools,
      this.ctx.opts.availableSet,
      this.ctx.opts.conversationId,
    )
  }

  /**
   * Builds the AI SDK tool map for the tool-loop {@link Agent} from {@link runtimeTools}.
   * @param skillId — required for skill/toolSet tools; MCP tools do not need it.
   * @param runCtx — active tool-loop step context (per-todo / per-run). Defaults to
   *   {@link this.ctx}; must be the context whose {@link AgentStepContext.stepInstanceKey}
   *   was used in {@link AgentStepContext.beginStep}, not a parent batch context.
   */
  protected buildToolSet(
    skillId?: string,
    runCtx: AgentStepContext = this.ctx,
  ) {
    const tools = this.getFilteredRuntimeTools()
    const userId = runCtx.opts.userId
    const toolSet: Record<string, any> = {}
    const isRootRun =
      runCtx.agentRun?.meta?.depth === undefined ||
      runCtx.agentRun?.meta?.depth === 0

    for (const toolMeta of tools) {
      if (PLAN_MODE_TOOL_NAMES.has(toolMeta.name) && !isRootRun) continue
      if (
        toolMeta.name === INVOKE_AGENT_TOOL_NAME &&
        !runCtx.executionSteps?.toolLoop?.allowSubAgents
      ) {
        continue
      }
      toolSet[toolMeta.name] = {
        type: 'function' as const,
        description: runCtx.config.buildToolPromptDescription(toolMeta),
        inputSchema:
          toolMeta.inputSchema != null
            ? jsonSchema(toolMeta.inputSchema)
            : (jsonSchema({
                type: 'object',
                additionalProperties: true,
              }) as any),
        needsApproval: toolMeta.needsApproval ?? false,
        async execute(input: unknown) {
          if (toolMeta.source === 'mcp') {
            return callMcpToolDirect(
              userId,
              (toolMeta as any).serverId,
              (toolMeta as any).toolName,
              input,
            )
          }
          if (!skillId?.trim()) {
            throw new Error(
              STEP_ERRORS.TOOL_NO_SKILL_ID.replace(
                '{toolName}',
                toolMeta.name,
              ),
            )
          }
          const result = await callSkillToolDirect(
            skillId,
            toolMeta.name,
            input,
            runCtx,
          )
          stepLog.debug('callSkillToolDirect completed', {
            toolName: toolMeta.name,
            result,
          })
          return result
        },
      }
    }

    const pathContext = resolveToolPathNormalizeContextFromRunCtx(runCtx)
    applyRunScopedReadCache(toolSet, {
      cache: runCtx.agentFlow.toolReadCache,
      getPathContext: () => pathContext,
    })
    applyReadFileLedgerGate(toolSet, {
      cache: runCtx.agentFlow.toolReadCache,
      getPathContext: () => pathContext,
    })
    applyPerStreamToolInputDedupe(toolSet, {
      state: runCtx.agentFlow.toolInputDedupeState,
      pathContext,
    })
    applySessionToolApprovals(toolSet, runCtx.opts.conversationId)
    applyCodingAgentPolicy(
      toolSet,
      runCtx.opts.conversationId,
      runCtx.opts.skillId,
      runCtx.agentRun?.meta?.depth,
    )

    return toolSet
  }

  /** `stopWhen` conditions for {@link Agent}, honoring `maxIterations`. */
  protected getAgentStopWhen() {
    const maxIterations = resolveToolLoopMaxIterations(
      this.ctx.executionSteps?.toolLoop?.maxIterations ??
        this.ctx.opts.toolLoopMaxIterations,
    )
    // Bounded only by the iteration budget; the loop ends naturally when the
    // model stops calling tools. (No longer halts after run_script so scripts
    // can be chained iteratively.)
    return [stepCountIs(maxIterations)]
  }

  /**
   * When `expandMarkdownLinks` is true (skill/tool execution paths only), resolves
   * markdown links in `system`, fetches each target once per agent run (cached on the
   * flow context), and appends inlined bodies. Otherwise returns `system` unchanged.
   *
   * `skipExpandHrefKeys` are normalized keys (see `normalizeMarkdownHrefKey`) for
   * targets already inlined in the same prompt (e.g. planned `REFERENCE MATERIALS`),
   * so link expansion does not duplicate that content.
   */
  protected async augmentSystemWithLinkedReferences(
    system: string,
    stepCtx: AgentStepContext = this.ctx,
    expandMarkdownLinks = false,
    skipExpandHrefKeys?: ReadonlySet<string>,
  ): Promise<string> {
    if (!expandMarkdownLinks) return system
    return appendLinkedMarkdownReferenceSections(system, stepCtx, {
      skipExpandHrefKeys,
    })
  }

  protected async collectStream(
    system: string,
    messages: any[],
    options?: {
      expandMarkdownLinks?: boolean
      skipExpandHrefKeys?: ReadonlySet<string>
    },
  ): Promise<string> {
    if (options?.expandMarkdownLinks) {
      system = await appendLinkedMarkdownReferenceSections(system, this.ctx, {
        skipExpandHrefKeys: options.skipExpandHrefKeys,
      })
    }
    const { text } = await this.ctx.providers.streamTextToStepProgress(this.ctx, {
      system,
      messages,
      abortSignal: this.ctx.opts.abortSignal,
    } as StreamTextParams)
    return text
  }
}
