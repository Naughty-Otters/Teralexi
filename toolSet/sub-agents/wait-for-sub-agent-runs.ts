import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import { assertRootSubAgentDelegation } from './delegation-context'
import { WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME, SUB_AGENT_TAG } from './constants'

export const waitForSubAgentRunsTool: SkillTool = {
  name: WAIT_FOR_SUB_AGENT_RUNS_TOOL_NAME,
  tags: [...SUB_AGENT_TAG],
  description:
    'Wait for one or more background sub-agent runs to finish. Returns per-run briefs ' +
    '(summary, filesTouched, status) — sibling failures do not abort the batch.',
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

    const paused = results.find((r) => r.hitlPaused && r.childRun && r.result)
    if (
      paused?.childRun &&
      paused.result &&
      typeof parentRun.mergeChildHitlPause === 'function'
    ) {
      parentRun.mergeChildHitlPause(paused.childRun, paused.result)
    }

    return {
      results: results.map((r) => ({
        runId: r.runId,
        agentId: r.agentId,
        agentName: r.agentName,
        status: r.status,
        summary: r.summary ?? r.report,
        filesTouched: r.filesTouched ?? [],
        openQuestions: r.openQuestions ?? [],
        error: r.error,
        hitlPaused: r.hitlPaused,
        worktreePath: r.worktreePath,
        worktreeBranch: r.worktreeBranch,
        worktreeOutcome: r.worktreeOutcome,
      })),
    }
  },
}
