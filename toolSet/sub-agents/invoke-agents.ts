import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  assertRootSubAgentDelegation,
  buildSubAgentChildParams,
  isSubAgentIdAllowed,
  resolveSubAgentTargetIdFromDelegation,
} from './delegation-context'
import { INVOKE_AGENTS_TOOL_NAME, SUB_AGENT_TAG } from './constants'

const invokeAgentsSchema = z.object({
  runs: z
    .array(
      z.object({
        agentId: z.string().min(1),
        task: z.string().min(1),
      }),
    )
    .min(1),
  wait: z
    .boolean()
    .optional()
    .describe(
      'When false, return runIds immediately (background). When true (default), wait for all runs and return per-run results.',
    ),
  detach: z
    .boolean()
    .optional()
    .describe(
      'When true, force wait=false so the parent can finish while children keep running (detachable background).',
    ),
})

export const invokeAgents: SkillTool = {
  name: INVOKE_AGENTS_TOOL_NAME,
  tags: [...SUB_AGENT_TAG],
  description:
    'Delegate multiple sub-tasks to configured agents in parallel. ' +
    'Spawn is always background; use wait=true (default) to collect per-run results, ' +
    'or wait=false and later wait_for_sub_agent_runs. Sibling failures do not abort the batch.',
  inputSchema: invokeAgentsSchema,
  needsApproval: false,
  async execute(input) {
    const parsed = invokeAgentsSchema.safeParse(input)
    if (!parsed.success) {
      return { error: 'Invalid invoke_agents input.', detail: parsed.error.flatten() }
    }

    const delegation = assertRootSubAgentDelegation()
    if (!delegation.allowSubAgents) {
      throw new Error('invoke_agents is not enabled for this agent')
    }

    const parentRun = delegation.parentRun
    if (!parentRun?.spawnChildRun) {
      throw new Error('invoke_agents requires an active AgentRun')
    }

    const { runs, wait: waitInput = true, detach = false } = parsed.data
    const wait = detach ? false : waitInput

    // Preflight: resolve + validate all targets before any spawn (no orphans).
    const prepared: Array<{
      requestedId: string
      resolvedId: string
      task: string
    }> = []
    for (const run of runs) {
      const requestedId = run.agentId.trim()
      const task = run.task.trim()
      if (!requestedId) {
        return { error: 'invoke_agents requires a non-empty agentId for every run' }
      }
      if (!task) {
        return { error: 'invoke_agents requires a non-empty task for every run' }
      }
      const resolvedId = await resolveSubAgentTargetIdFromDelegation(
        delegation,
        requestedId,
      )
      if (
        !isSubAgentIdAllowed(requestedId, resolvedId, delegation.subAgentIds)
      ) {
        return {
          error: `Agent "${requestedId}" is not enabled for invoke_agents`,
        }
      }
      prepared.push({ requestedId, resolvedId, task })
    }

    const parentRunId = parentRun.meta?.runId?.trim()
    if (
      parentRunId &&
      typeof parentRun.remainingParallelSlots === 'function'
    ) {
      const slots = parentRun.remainingParallelSlots()
      if (prepared.length > slots) {
        return {
          error: `Too many parallel sub-agents requested (${prepared.length}); only ${slots} slot(s) remaining`,
        }
      }
    }

    const spawned: Array<{ runId: string; agentId: string; agentName: string }> =
      []
    try {
      for (const run of prepared) {
        const entry = await parentRun.spawnChildRun(
          buildSubAgentChildParams(delegation, {
            agentId: run.resolvedId,
            task: run.task,
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
        detached: detach || undefined,
      }
    }

    if (!parentRun.waitForChildRuns) {
      throw new Error('invoke_agents wait mode requires waitForChildRuns')
    }

    const waitResults = await parentRun.waitForChildRuns(
      spawned.map((s) => s.runId),
    )

    // Merge HITL from the first paused child (single-level HITL policy).
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
        worktreeOutcome: r.worktreeOutcome,
      })),
    }
  },
}
