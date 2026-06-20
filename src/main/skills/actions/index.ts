import { createLogger } from '@main/logger'
import { classifyToolFailure } from '@main/agent/expr/tool-failure'
import { serializeForToolLog } from '@main/agent/expr/tool-log-utils'

const legacyToolLog = createLogger('agent.tool-call')

/**
 * Common actions interface for the skill framework.
 *
 * Every `actions/index.ts` file inside a skill folder must export a `tools`
 * array whose items satisfy the `SkillTool` contract.  The runtime loads
 * these tools automatically and makes them available to the Agent execution step.
 *
 * Usage in a skill's actions/index.ts:
 * ─────────────────────────────────────
 * import type { SkillTool, SkillToolModule } from '@main/skills/actions'
 *
 * export const tools: SkillTool[] = [
 *   {
 *     name: 'my_tool',
 *     description: 'Does something useful',
 *     execute: async (input) => { ... }
 *   }
 * ]
 *
 * // Satisfies the module contract so the loader can verify the export
 * export default { tools } satisfies SkillToolModule
 * ─────────────────────────────────────
 */

export type { SkillTool } from '../types'

/**
 * The shape that every `actions/index.ts` default export must conform to.
 * This allows external consumers to import and type-check tool modules.
 */
export interface SkillToolModule {
  tools: import('../types').SkillTool[]
}

/**
 * Run skill tools in a loop until no tool applies or the iteration cap is reached.
 * (Legacy helper; pipeline tool execution uses {@link Agent} from `@ai-sdk-tools/agents`.)
 *
 * @param tools          - available tool implementations
 * @param initialInput   - user / context input to begin with
 * @param maxIterations  - hard stop to prevent infinite loops (default: 5)
 * @returns              - the final accumulated output
 */
export async function runAgent(
  tools: import('../types').SkillTool[],
  initialInput: Record<string, unknown>,
  maxIterations = 5,
): Promise<unknown> {
  if (tools.length === 0) return null

  let iteration = 0
  let context: Record<string, unknown> = { ...initialInput }
  const outputs: unknown[] = []

  while (iteration < maxIterations) {
    iteration++
    let anyToolApplied = false

    for (const tool of tools) {
      legacyToolLog.info('legacy runAgent tool call start', {
        toolName: tool.name,
        source: 'legacy',
        input: serializeForToolLog(context),
      })
      try {
        const result = await tool.execute(context)
        if (classifyToolFailure(tool.name, result)) {
          legacyToolLog.warn('legacy runAgent tool returned failure result', {
            toolName: tool.name,
            result: serializeForToolLog(result),
          })
        } else {
          legacyToolLog.info('legacy runAgent tool call completed', {
            toolName: tool.name,
            result: serializeForToolLog(result),
          })
        }
        outputs.push({ tool: tool.name, result })
        if (result !== null && typeof result === 'object') {
          context = { ...context, ...(result as Record<string, unknown>) }
        }
        anyToolApplied = true
      } catch (err) {
        legacyToolLog.error('legacy runAgent tool call failed', {
          toolName: tool.name,
          errorMessage: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : undefined,
        })
        throw err
      }
    }

    // If no tool ran successfully, the loop has nothing more to do
    if (!anyToolApplied) break

    // If context signals completion, stop early
    if (context['done'] === true) break
  }

  return outputs
}
