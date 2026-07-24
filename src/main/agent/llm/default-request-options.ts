/**
 * Default AI SDK 7 request options applied at the streamText / Agent choke points.
 * Caller-provided values always win.
 */

export type LlmTimeoutDefaults = {
  /** Abort if no first output chunk arrives within this window. */
  firstChunkMs: number
  /** Abort if the stream stalls between chunks longer than this. */
  chunkMs: number
  /** Default per-tool execution budget (override per-tool later if needed). */
  toolMs: number
}

/** Conservative hang detection — no total/step caps (agent runs can be long). */
export const DEFAULT_LLM_TIMEOUT: LlmTimeoutDefaults = {
  firstChunkMs: 120_000,
  chunkMs: 300_000,
  toolMs: 900_000,
}

export type StreamTextRequestExtras = {
  timeout?: LlmTimeoutDefaults | number | Record<string, unknown>
}

/**
 * Merge default timeout into streamText / Agent modelSettings.
 * Existing `timeout` on the call is left untouched.
 */
export function withDefaultLlmTimeout<T extends StreamTextRequestExtras>(
  params: T,
  defaults: LlmTimeoutDefaults = DEFAULT_LLM_TIMEOUT,
): T {
  if (params.timeout != null) return params
  return {
    ...params,
    timeout: { ...defaults },
  }
}
