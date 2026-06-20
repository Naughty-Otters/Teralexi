/** Default llama.cpp server OpenAI-compatible base URL (`llama-server`). */
export const LLAMACPP_DEFAULT_BASE_URL = 'http://127.0.0.1:8080/v1'

/** Ensure base URL ends with `/v1` for the OpenAI-compatible API. */
export function normalizeLlamaCppBaseURL(
  url: string,
  fallback: string = LLAMACPP_DEFAULT_BASE_URL,
): string {
  const value = url.trim()
  const base = (value || fallback).replace(/\/$/, '')
  if (base.endsWith('/v1')) return base
  return `${base}/v1`
}
