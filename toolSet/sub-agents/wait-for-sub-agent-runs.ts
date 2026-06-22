import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import { assertRootSubAgentDelegation } from './delegation-context'
import { WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME, SUB_AGENT_TAG } from './constants'
import { mergeSubFlowOutputText } from '@main/agent/run/sub-flow-output-text'

export const waitForSubAgentRunsTool: SkillTool = {
  name: WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME,
  tags: [...SUB_AGENT_TAG],
  description:
    'Wait for one or more background sub-agent runs to finish and return their reports.',
  inputSchema: z.object({
    runIds: z.array(z.string().min(1)).min(1),
  }),
  needsApproval: false,
  async execute(input) {
    const parsed = z.object({ runIds: z.array(z.string()) }).safeParse(input)
    if (!parsed.success) {
      return {
        error: 'Invalid wait_for_sub_agent_runs input.',
        detail: parsed.error.flatten(),
      }
    }

    const delegation = assertRootSubAgentDelegation()
    const parentRun = delegation.parentRun
    if (!parentRun?.waitForChildRuns) {
      throw new Error('wait_for_sub_agent_runs requires an active AgentRun')
    }

    const runIds = parsed.data.runIds.map((id) => id.trim()).filter(Boolean)
    const results = await parentRun.waitForChildRuns(runIds)

    return {
      results: results.map((result, i) => ({
        runId: runIds[i],
        report: mergeSubFlowOutputText(result.stepOutputs, 'report'),
        hitlPaused: result.hitlPaused,
      })),
    }
  },
}
