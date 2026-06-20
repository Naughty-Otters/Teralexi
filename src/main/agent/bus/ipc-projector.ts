import type { AgentStreamBridge } from '../agent-stream-bridge'
import type { AgentEventBus } from './agent-event-bus'

/**
 * Attach the per-run event bus to IPC bridge callbacks.
 * LLM text/step progress and tool UI chunks remain on direct callbacks for parity;
 * this hook forwards bus events when explicit projection is added later.
 */
export function attachIpcProjector(
  bus: AgentEventBus,
  _bridge: Pick<AgentStreamBridge, 'onChunk' | 'onStepProgress' | 'onUIMessageChunk'>,
): () => void {
  return bus.subscribeAll((_event) => {
    // Tool-loop UI chunks are emitted via LlmProcessor handlers.
    // Pipeline step progress uses direct emitStepProgress callbacks.
  })
}
