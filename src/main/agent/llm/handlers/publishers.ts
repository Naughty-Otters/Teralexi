import type {
  LlmEventHandlerContext,
  LlmProcessorState,
} from './types'

export function publishTextDelta(
  ctx: LlmEventHandlerContext,
  delta: string,
): void {
  if (!delta) return
  ctx.run.bus?.publish({ type: 'agent.llm.text.delta', delta })
  if (ctx.run.mode === 'silent') return
  if (ctx.run.emitStepProgress) {
    ctx.run.emitStepProgress(delta)
  } else {
    ctx.run.onChunk?.(delta)
  }
}

export function publishToolUpdated(
  ctx: LlmEventHandlerContext,
  toolCallId: string,
  status: 'pending' | 'running' | 'completed' | 'error',
  name: string,
): void {
  ctx.run.bus?.publish({
    type: 'agent.llm.tool.updated',
    toolCallId,
    name,
    status,
  })
}

export function updateToolPart(
  state: LlmProcessorState,
  id: string,
  name: string,
  status: 'pending' | 'running' | 'completed' | 'error' | 'denied',
  input?: unknown,
): void {
  const prev = state.toolParts.get(id)
  state.toolParts.set(id, {
    name,
    status,
    input: input !== undefined ? input : prev?.input,
  })
}

export function publishUIMessageChunk(
  ctx: LlmEventHandlerContext,
  chunk: Record<string, unknown>,
): void {
  if (ctx.run.mode === 'silent') return
  ctx.run.onUIMessageChunk?.(chunk)
}
