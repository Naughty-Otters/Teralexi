import type { LlmEvent } from '../events'
import {
  drainFullStreamToLlmEvents,
  drainTextStreamToLlmEvents,
} from './ai-sdk-adapter'
import { createDefaultLlmEventHandlerRegistry } from './handlers/registry'
import type {
  LlmEventHandler,
  LlmEventHandlerContext,
  LlmProcessorContext,
  LlmProcessorState,
} from './handlers/types'
import { createLlmProcessorState } from './handlers/types'
import {
  resolveToolCallsForAgentStream,
  type LlmDebugToolCallRecord,
} from './llm-debug-tool-calls'
import {
  collectToolOutputFallbackText,
  forwardAgentUiMessageStream,
  reconcilePendingApprovalKeys,
  type AgentCollectResult,
  type AgentStreamCollectSource,
} from './ui-message-projector'

export type {
  LlmProcessorMode,
  LlmProcessorContext,
  LlmProcessorState,
  LlmEventHandler,
  LlmEventHandlerContext,
  LlmEventType,
  LlmEventForType,
} from './handlers/types'

export { createLlmProcessorState } from './handlers/types'
export {
  createDefaultLlmEventHandlers,
  createDefaultLlmEventHandlerRegistry,
  indexLlmEventHandlers,
} from './handlers/registry'

export type CollectAgentStreamParams = {
  result: AgentStreamCollectSource
  ctx: LlmProcessorContext
  onToolCallsCollected?: (toolCalls: LlmDebugToolCallRecord[]) => void
}

export type CollectAgentStreamResult = AgentCollectResult & {
  events: LlmEvent[]
}

/** Dispatches {@link LlmEvent}s to typed handler classes. */
export class LlmProcessor {
  readonly state: LlmProcessorState
  private readonly handlers: Map<string, LlmEventHandler>

  constructor(
    state?: LlmProcessorState,
    handlers: Map<string, LlmEventHandler> = createDefaultLlmEventHandlerRegistry(),
  ) {
    this.state = state ?? createLlmProcessorState()
    this.handlers = handlers
  }

  processEvent(event: LlmEvent, ctx: LlmProcessorContext): void {
    const handler = this.handlers.get(event.type)
    if (!handler) return

    const handlerCtx: LlmEventHandlerContext = {
      state: this.state,
      run: ctx,
    }
    handler.handle(event as never, handlerCtx)
  }

  get combinedText(): string {
    return this.state.text
  }

  /**
   * Collect an {@link Agent.stream} / tool-loop result: drain `fullStream` through
   * handlers and, when available, forward native `toUIMessageStream` chunks to Chat IPC.
   */
  async collectAgentStream(
    params: CollectAgentStreamParams,
  ): Promise<CollectAgentStreamResult> {
    const { result, ctx, onToolCallsCollected } = params
    const mode = ctx.mode ?? 'progress'

    const useNativeUiStream =
      typeof ctx.onUIMessageChunk === 'function' &&
      typeof result.toUIMessageStream === 'function'

    const processorCtx: LlmProcessorContext = {
      ...ctx,
      mode,
      // Native toUIMessageStream owns Chat IPC; handlers synthesize only as fallback.
      onUIMessageChunk: useNativeUiStream ? undefined : ctx.onUIMessageChunk,
    }

    const events: LlmEvent[] = []
    const onEvent = (event: LlmEvent) => {
      events.push(event)
      this.processEvent(event, processorCtx)
    }

    const uiForwardPromise = forwardAgentUiMessageStream({
      result,
      onUIMessageChunk: ctx.onUIMessageChunk,
      pendingApprovals: this.state.pendingApprovals,
      mode,
    })

    const drainPromise = result.fullStream
      ? drainFullStreamToLlmEvents(result.fullStream, onEvent)
      : drainTextStreamToLlmEvents(result.textStream, onEvent)

    await Promise.all([uiForwardPromise, drainPromise])

    await result.response

    const steps = result.steps ? await result.steps : undefined
    const pendingAfterStream = await reconcilePendingApprovalKeys(
      this.state.pendingApprovals,
      steps,
    )

    const fallback =
      this.combinedText.trim() === ''
        ? await collectToolOutputFallbackText(result)
        : ''
    const text = [this.combinedText.trim(), fallback.trim()]
      .filter(Boolean)
      .join('\n\n')

    const toolCalls = resolveToolCallsForAgentStream({ events, steps })
    onToolCallsCollected?.(toolCalls)

    return {
      text,
      awaitingToolApproval: pendingAfterStream.size > 0,
      toolCalls,
      events,
    }
  }
}

export function processLlmEvents(
  events: readonly LlmEvent[],
  ctx: LlmProcessorContext,
  state?: LlmProcessorState,
): LlmProcessorState {
  const processor = new LlmProcessor(state)
  for (const event of events) {
    processor.processEvent(event, ctx)
  }
  return processor.state
}
