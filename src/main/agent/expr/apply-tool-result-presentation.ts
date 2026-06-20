import { normalizeToolResult } from '@shared/tool-result/normalize-tool-result'
import { hydrateToolResultFromOutputFiles } from './hydrate-tool-result-from-files'

export type ToolResultPresentationOpts = {
  getSandboxRoot?: () => string | undefined
}

/**
 * Wrap each tool's execute() so object results carry `resultType` and
 * UI-friendly payloads (e.g. `files[]` on file-change tools).
 *
 * Apply after {@link applyToolOutputTruncation} and {@link applyLspDiagnostics}
 * so stamped fields match what the model and renderer see.
 */
export function applyToolResultPresentation(
  toolSet: Record<string, unknown>,
  opts?: ToolResultPresentationOpts,
): void {
  for (const name of Object.keys(toolSet)) {
    const spec = toolSet[name] as Record<string, unknown> | null
    if (!spec || typeof spec['execute'] !== 'function') continue

    const origExecute = (
      spec['execute'] as (...a: unknown[]) => Promise<unknown>
    ).bind(spec)

    spec['execute'] = async (input: unknown): Promise<unknown> => {
      const result = await origExecute(input)
      const normalized = normalizeToolResult(name, result)
      return hydrateToolResultFromOutputFiles(
        name,
        normalized,
        opts?.getSandboxRoot?.(),
      )
    }
  }
}
