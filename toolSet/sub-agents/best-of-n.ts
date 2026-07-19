import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  assertRootSubAgentDelegation,
  buildSubAgentChildParams,
  isSubAgentIdAllowed,
  resolveSubAgentTargetIdFromDelegation,
} from './delegation-context'
import { BEST_OF_N_TOOL_NAME, SUB_AGENT_TAG } from './constants'

const bestOfNSchema = z.object({
  agentId: z.string().min(1).describe('Catalog agent id to run N times'),
  task: z.string().min(1).describe('Same task for every candidate run'),
  n: z
    .number()
    .int()
    .min(2)
    .max(5)
    .describe('Number of parallel candidates (2–5)'),
  wait: z
    .boolean()
    .optional()
    .describe(
      'When false, return runIds immediately. When true (default), wait and return per-run results for side-by-side compare.',
    ),
  detach: z
    .boolean()
    .optional()
    .describe(
      'When true, force wait=false so the parent can finish while candidates keep running.',
    ),
})

export const bestOfN: SkillTool = {
  name: BEST_OF_N_TOOL_NAME,
  tags: [...SUB_AGENT_TAG],
  description:
    'Run the same task with N parallel isolated sub-agent candidates (best-of-N). ' +
    'Each mutating run gets its own git worktree/branch. Compare reports and pick one to merge or open a PR.',
  inputSchema: bestOfNSchema,
  needsApproval: false,
  async execute(input) {
    const parsed = bestOfNSchema.safeParse(input)
    if (!parsed.success) {
      return { error: 'Invalid best_of_n input.', detail: parsed.error.flatten() }
    }

    const delegation = assertRootSubAgentDelegation()
    if (!delegation.allowSubAgents) {
      throw new Error('best_of_n is not enabled for this agent')
    }

    const parentRun = delegation.parentRun
    if (!parentRun?.spawnChildRun) {
      throw new Error('best_of_n requires an active AgentRun')
    }

    const { agentId, task, n, wait: waitInput = true, detach = false } =
      parsed.data
    const wait = detach ? false : waitInput
    const requestedId = agentId.trim()
    const taskText = task.trim()
    if (!requestedId || !taskText) {
      return { error: 'best_of_n requires non-empty agentId and task' }
    }

    const resolvedId = await resolveSubAgentTargetIdFromDelegation(
      delegation,
      requestedId,
    )
    if (
      !isSubAgentIdAllowed(requestedId, resolvedId, delegation.subAgentIds)
    ) {
      return { error: `Agent "${requestedId}" is not enabled for best_of_n` }
    }

    const parentRunId = parentRun.meta?.runId?.trim()
    if (
      parentRunId &&
      typeof parentRun.remainingParallelSlots === 'function'
    ) {
      const slots = parentRun.remainingParallelSlots()
      if (n > slots) {
        return {
          error: `Too many best-of-N candidates (${n}); only ${slots} slot(s) remaining`,
        }
      }
    }

    const spawned: Array<{ runId: string; agentId: string; agentName: string }> =
      []
    try {
      for (let i = 0; i < n; i++) {
        const entry = await parentRun.spawnChildRun(
          buildSubAgentChildParams(delegation, {
            agentId: resolvedId,
            task: taskText,
          }),
          { waitMode: 'background', detached: detach || undefined },
        )
        spawned.push(entry)
      }
    } catch (err) {
      for (const s of spawned) {
        parentRun.cancelChildRun?.(s.runId)
      }
      throw err
    }

    if (!wait) {
      return {
        runIds: spawned.map((s) => s.runId),
        runs: spawned,
        bestOfN: true,
        n,
        task: taskText,
        detached: detach || undefined,
      }
    }

    if (!parentRun.waitForChildRuns) {
      throw new Error('best_of_n wait mode requires waitForChildRuns')
    }

    const waitResults = await parentRun.waitForChildRuns(
      spawned.map((s) => s.runId),
    )

    const paused = waitResults.find(
      (r) => r.hitlPaused && r.childRun && r.result,
    )
    if (
      paused?.childRun &&
      paused.result &&
      typeof parentRun.mergeChildHitlPause === 'function'
    ) {
      parentRun.mergeChildHitlPause(paused.childRun, paused.result)
    }

    return {
      bestOfN: true,
      n,
      task: taskText,
      results: waitResults.map((r) => ({
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
      })),
    }
  },
}
