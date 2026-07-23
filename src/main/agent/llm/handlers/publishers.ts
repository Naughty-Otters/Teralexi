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
  if (ctx.run.synthesizeUiChunk) return
  if (ctx.run.suppressTextStepProgress) return
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

export function publishSynthesizedUiChunk(
  ctx: LlmEventHandlerContext,
  chunk: Record<string, unknown>,
): void {
  if (ctx.run.mode === 'silent') return
  ctx.run.synthesizeUiChunk?.(chunk)
}

export function closeOpenTextPart(ctx: LlmEventHandlerContext): void {
  const id = ctx.state.activeTextPartId
  if (!ctx.state.openTextPart || !id) return
  publishSynthesizedUiChunk(ctx, { type: 'text-end', id })
  ctx.state.openTextPart = false
  ctx.state.activeTextPartId = undefined
}

export function openTextPart(ctx: LlmEventHandlerContext, id: string): void {
  closeOpenTextPart(ctx)
  ctx.state.activeTextPartId = id
  ctx.state.openTextPart = true
  publishSynthesizedUiChunk(ctx, { type: 'text-start', id })
}

export function publishTextDeltaUiChunk(
  ctx: LlmEventHandlerContext,
  id: string,
  delta: string,
): void {
  if (!delta || ctx.run.mode === 'silent') return
  if (!ctx.run.synthesizeUiChunk) return
  if (!ctx.state.openTextPart || ctx.state.activeTextPartId !== id) {
    openTextPart(ctx, id)
  }
  publishSynthesizedUiChunk(ctx, { type: 'text-delta', id, delta })
}

export function publishStandaloneTextBubble(
  ctx: LlmEventHandlerContext,
  partId: string,
  text: string,
): void {
  if (!text || ctx.run.mode === 'silent') return
  if (ctx.run.synthesizeUiChunk) {
    publishSynthesizedUiChunk(ctx, { type: 'text-start', id: partId })
    publishSynthesizedUiChunk(ctx, { type: 'text-delta', id: partId, delta: text })
    publishSynthesizedUiChunk(ctx, { type: 'text-end', id: partId })
    return
  }
  publishTextDelta(ctx, text)
}

export function publishReasoningUiChunk(
  ctx: LlmEventHandlerContext,
  chunk: Record<string, unknown>,
): void {
  publishSynthesizedUiChunk(ctx, chunk)
}
