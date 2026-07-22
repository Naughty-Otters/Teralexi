import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  assertRootSubAgentDelegation,
  buildSubAgentChildParams,
  isSubAgentIdAllowed,
  resolveSubAgentTargetIdFromDelegation,
} from './delegation-context'
import { INVOKE_AGENTS_TOOL_NAME, SUB_AGENT_TAG } from './constants'
import {
  applySubagentProfileToTask,
  resolveSubagentProfile,
} from './subagent-profiles'

const runSchema = z.object({
  agentId: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Catalog agent id. Optional when profile is set (defaults to the profile agent).',
    ),
  profile: z
    .enum(['explore', 'bash', 'browser', 'architect', 'coder', 'plan'])
    .optional()
    .describe(
      'Priority Cursor built-ins: explore | bash | browser. Orchestration: architect/plan | coder.',
    ),
  task: z.string().min(1),
})

const invokeAgentsSchema = z.object({
  runs: z
    .array(runSchema)
    .min(1)
    .describe(
      'One or more sub-agent runs. Use a single-item array for one child.',
    ),
})

export const invokeAgents: SkillTool = {
  name: INVOKE_AGENTS_TOOL_NAME,
  tags: [...SUB_AGENT_TAG],
  description:
    'Delegate one or more sub-tasks (parallel when multiple). Prefer Cursor built-in `profile`s ' +
    '(explore / bash / browser) for noisy work; use architect/coder for plan→implement. ' +
    'Always waits for all runs and returns per-run briefs (summary, filesTouched, status, worktreeOutcome). ' +
    'Use a one-element `runs` array for a single sub-agent. Sibling failures do not abort the batch.',
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

    const { runs } = parsed.data

    // Preflight: resolve + validate all targets before any spawn (no orphans).
    const prepared: Array<{
      requestedId: string
      resolvedId: string
      task: string
      allowedToolNames?: string[] | 'all'
      isolateGitWorktree?: boolean
      systemPromptAddendum?: string
      slimContext?: boolean
      mcpAccess?: 'none' | 'browser' | 'all'
      profile?: string
    }> = []
    for (const run of runs) {
      const profile = run.profile ? resolveSubagentProfile(run.profile) : null
      if (run.profile && !profile) {
        return { error: `Unknown profile "${run.profile}"` }
      }
      const requestedId = (run.agentId?.trim() || profile?.agentId || '').trim()
      const task = run.task.trim()
      if (!requestedId) {
        return {
          error: 'invoke_agents requires agentId or profile for every run',
        }
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
      const profileFields = profile
        ? applySubagentProfileToTask(profile, task)
        : null
      prepared.push({
        requestedId,
        resolvedId,
        task: profileFields?.task ?? task,
        allowedToolNames: profileFields?.allowedToolNames,
        isolateGitWorktree: profileFields?.isolateGitWorktree,
        systemPromptAddendum: profileFields?.systemPromptAddendum,
        slimContext: profileFields?.slimContext,
        mcpAccess: profileFields?.mcpAccess,
        profile: profileFields?.profile,
      })
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
            allowedToolNames: run.allowedToolNames,
            isolateGitWorktree: run.isolateGitWorktree,
            systemPromptAddendum: run.systemPromptAddendum,
            slimContext: run.slimContext,
            mcpAccess: run.mcpAccess,
          }),
          { waitMode: 'background' },
        )
        spawned.push(entry)
      }
    } catch (err) {
      for (const s of spawned) {
        parentRun.cancelChildRun?.(s.runId)
      }
      throw err
    }

    if (!parentRun.waitForChildRuns) {
      throw new Error('invoke_agents requires waitForChildRuns')
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
        profile: prepared.find((p) => p.resolvedId === r.agentId)?.profile,
      })),
    }
  },
}
