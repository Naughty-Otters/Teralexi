import { streamText } from '@teralexi-ai/llm-adapter'
import type { LanguageModelUsage } from '@teralexi-ai'
import { createLogger } from '@main/logger'
import type { AgentEventBus } from '../bus/agent-event-bus'
import {
  drainFullStreamToLlmEvents,
  drainTextStreamToLlmEvents,
} from './ai-sdk-adapter'
import type { LlmEvent } from './events'
import { logLlmError } from './log-llm-error'
import {
  validateStreamTextParamsForLlm,
  type LlmMessageValidationContext,
} from './validate-llm-payload'
import { LlmProcessor, type LlmProcessorContext, type LlmProcessorMode } from './processor'
import { extractOrderedToolCallsFromLlmEvents } from './llm-debug-tool-calls'
import {
  buildStreamTextDebugRequest,
  type LlmDebugContext,
  scheduleLlmDebugRequest,
  scheduleLlmDebugResponse,
} from './llm-debug-writer'
import { LlmResponse } from './llm-response'
import { type LlmDebugToolCallRecord } from './llm-debug-tool-calls'
import {
  type AgentCollectResult,
  type AgentStreamCollectSource,
} from './ui-message-projector'

const log = createLogger('agent.llm.runtime')

export type StreamTextParams = Parameters<typeof streamText>[0]

export type StreamTextResult = Awaited<ReturnType<typeof streamText>>

export type RunLlmStreamParams = {
  streamParams: StreamTextParams
  processorCtx?: LlmProcessorContext
  mode?: LlmProcessorMode
  validationContext?: LlmMessageValidationContext
  llmDebug?: LlmDebugContext
}

export type RunLlmStreamResult = {
  text: string
  events: LlmEvent[]
  response: StreamTextResult
  output?: unknown
  usage?: LanguageModelUsage
}

function buildProcessorCtx(
  params: RunLlmStreamParams,
): LlmProcessorContext {
  return {
    mode: params.mode ?? params.processorCtx?.mode ?? 'progress',
    onChunk: params.processorCtx?.onChunk,
    emitStepProgress: params.processorCtx?.emitStepProgress,
    onUIMessageChunk: params.processorCtx?.onUIMessageChunk,
    bus: params.processorCtx?.bus,
  }
}

async function drainStreamResult(
  result: StreamTextResult,
  processor: LlmProcessor,
  ctx: LlmProcessorContext,
): Promise<LlmEvent[]> {
  const events: LlmEvent[] = []
  const onEvent = (event: LlmEvent) => {
    events.push(event)
    processor.processEvent(event, ctx)
  }

  if (result.fullStream) {
    await drainFullStreamToLlmEvents(result.fullStream, onEvent)
  } else {
    await drainTextStreamToLlmEvents(result.textStream, onEvent)
  }

  return events
}

/** Event-driven LLM stream: AI SDK `streamText` → `LlmEvent` → processor. */
export async function runLlmStream(
  params: RunLlmStreamParams,
): Promise<RunLlmStreamResult> {
  const mode = params.mode ?? params.processorCtx?.mode ?? 'progress'
  log.debug('LLM stream starting', { mode })

  try {
    validateStreamTextParamsForLlm(params.streamParams, {
      label: 'runLlmStream',
      ...params.validationContext,
    })

    const debugCtx: LlmDebugContext = {
      ...params.llmDebug,
      stepId: params.llmDebug?.stepId ?? params.validationContext?.stepId,
      conversationId:
        params.llmDebug?.conversationId ??
        params.validationContext?.conversationId,
      agentId:
        params.llmDebug?.agentId ?? params.validationContext?.agentId,
    }
    const debugLabel = params.validationContext?.label
    const debugCallId = scheduleLlmDebugRequest(
      debugCtx,
      buildStreamTextDebugRequest(
        debugCtx,
        params.streamParams,
        debugLabel,
      ),
    )

    const result = streamText(params.streamParams)
    const processor = new LlmProcessor()
    const ctx = buildProcessorCtx(params)
    const events = await drainStreamResult(result, processor, ctx)
    await result.response

    let output: unknown
    if ('output' in result && result.output) {
      output = await result.output
    }

    const text = processor.combinedText
    if (!text.trim() && processor.state.finishReason === 'error') {
      const err = new Error('LLM stream finished with error')
      logLlmError('LLM stream finished with error reason and empty text', err, {
        mode,
        finishReason: processor.state.finishReason,
      })
      throw err
    } else if (!text.trim() && events.length === 0) {
      log.warn('LLM stream completed with no text and no events', { mode })
    } else {
      log.debug('LLM stream completed', {
        mode,
        textLength: text.length,
        eventCount: events.length,
        finishReason: processor.state.finishReason,
      })
    }

    if (debugCallId) {
      const toolCalls = extractOrderedToolCallsFromLlmEvents(events)
      const instructions =
        typeof params.streamParams.instructions === 'string'
          ? params.streamParams.instructions
          : typeof params.streamParams.system === 'string'
            ? params.streamParams.system
            : undefined
      const messagesBefore = Array.isArray(params.streamParams.messages)
        ? params.streamParams.messages
        : []
      scheduleLlmDebugResponse(
        debugCtx,
        debugCallId,
        {
          text,
          structuredOutput: output,
          toolCalls,
          instructions,
          messagesBefore,
          runtimeSnapshotAfter: params.llmDebug?.refreshRuntimeSnapshot?.(),
        },
        { callKind: 'streamText', label: debugLabel },
      )
    }

    return {
      text,
      events,
      response: result,
      output,
      usage: undefined,
    }
  } catch (err) {
    logLlmError('LLM stream failed', err, { mode, path: 'runLlmStream' })
    throw err
  }
}

export type RunAgentStreamParams = {
  result: AgentStreamCollectSource
  onChunk: (chunk: string) => void
  onUIMessageChunk?: (chunk: Record<string, unknown>) => void
  bus?: AgentEventBus
  mode?: LlmProcessorMode
  /** When set, populated with ordered tool calls from this agent stream. */
  onToolCallsCollected?: (toolCalls: LlmDebugToolCallRecord[]) => void
}

/** Collect an {@link Agent.stream} / tool-loop result via the event-driven path. */
export async function runAgentStream(
  params: RunAgentStreamParams,
): Promise<AgentCollectResult> {
  const {
    result,
    onChunk,
    onUIMessageChunk,
    bus,
    mode = 'progress',
    onToolCallsCollected,
  } = params

  log.debug('Agent stream collection starting', { mode })

  try {
    const processor = new LlmProcessor()
    const collected = await processor.collectAgentStream({
      result,
      ctx: { mode, onChunk, onUIMessageChunk, bus },
      onToolCallsCollected,
    })

    if (!collected.text.trim() && !collected.awaitingToolApproval) {
      log.warn('Agent stream collection completed with empty text', {
        mode,
        eventCount: collected.events.length,
        finishReason: processor.state.finishReason,
        pendingApprovals: 0,
      })
    }

    const { events: _events, ...agentResult } = collected
    return agentResult
  } catch (err) {
    logLlmError('Agent stream collection failed', err, {
      mode,
      path: 'runAgentStream',
    })
    throw err
  }
}

export { LlmResponse, LlmProcessor, type LlmProcessorContext }
