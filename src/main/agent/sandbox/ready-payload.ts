import { pathToFileURL } from 'node:url'
import type { SandboxReadyPayload } from './types'

export type BuildSandboxReadyPayloadInput = {
  conversationId?: string
  sandboxRoot: string
  outputResultsDir: string
}

export function buildSandboxReadyPayload(
  input: BuildSandboxReadyPayloadInput,
): SandboxReadyPayload {
  let resultsFileUrl = pathToFileURL(input.outputResultsDir).href
  if (!resultsFileUrl.endsWith('/')) resultsFileUrl += '/'
  return {
    conversationId: input.conversationId ?? '',
    sandboxRoot: input.sandboxRoot,
    outputResultsDir: input.outputResultsDir,
    resultsFileUrl,
  }
}
