import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  assertRootSubAgentDelegation,
  buildSubAgentChildParams,
  isSubAgentIdAllowed,
  resolveSubAgentTargetIdFromDelegation,
} from './delegation-context'
import { INVOKE_AGENT_TOOL_NAME, SUB_AGENT_TAG } from './constants'
import { buildSubAgentBrief } from '@main/agent/run/sub-flow-output-text'

export const invokeAgent: SkillTool = {
  name: INVOKE_AGENT_TOOL_NAME,
  tags: [...SUB_AGENT_TAG],
  description:
    'Delegate a sub-task to another configured agent. Returns a structured brief ' +
    '(summary, filesTouched, status, worktreeOutcome). ' +
    'File changes are auto-merged into the workspace when present. ' +
    'Do not re-invoke just because the summary looks long or ends with a cap notice — ' +
    'the full report is in the sub-agent chat bubble. ' +
    'Set wait=false to run in parallel and receive a runId; use wait_for_sub_agent_runs to collect results.',
  inputSchema: z.object({
    agentId: z.string().min(1).describe('Catalog agent id to run'),
    task: z.string().min(1).describe('Task for the sub-agent'),
    wait: z
      .boolean()
      .optional()
      .describe('When false, start in background and return runId immediately'),
    detach: z
      .boolean()
      .optional()
      .describe(
        'When true, force wait=false so the parent can finish while the child keeps running',
      ),
  }),
  needsApproval: false,
  async execute(input) {
    const parsed = z
      .object({
        agentId: z.string(),
        task: z.string(),
        wait: z.boolean().optional(),
        detach: z.boolean().optional(),
      })
      .safeParse(input)
    if (!parsed.success) {
      return { error: 'Invalid invoke_agent input.', detail: parsed.error.flatten() }
    }

    const delegation = assertRootSubAgentDelegation()
    if (!delegation.allowSubAgents) {
      throw new Error('invoke_agent is not enabled for this agent')
    }

    const { agentId, task, wait: waitInput = true, detach = false } = parsed.data
    const wait = detach ? false : waitInput
    const requestedId = agentId.trim()
    if (!requestedId) {
      throw new Error('invoke_agent requires agentId')
    }

    const resolvedId = await resolveSubAgentTargetIdFromDelegation(
      delegation,
      requestedId,
    )
    if (!isSubAgentIdAllowed(requestedId, resolvedId, delegation.subAgentIds)) {
      throw new Error(`Agent "${requestedId}" is not enabled for invoke_agent`)
    }

    const parentRun = delegation.parentRun
    if (!parentRun) {
      throw new Error('invoke_agent requires an active AgentRun')
    }

    const childParams = buildSubAgentChildParams(delegation, {
      agentId: resolvedId,
      task,
    })

    if (!wait && parentRun.spawnChildRun) {
      const spawned = await parentRun.spawnChildRun(childParams, {
        waitMode: 'background',
        detached: detach || undefined,
      })
      return {
        runId: spawned.runId,
        agentId: spawned.agentId,
        agentName: spawned.agentName,
        background: true,
        detached: detach || undefined,
      }
    }

    if (!parentRun.spawnChildRun) {
      throw new Error('invoke_agent requires spawnChildRun')
    }

    const spawned = await parentRun.spawnChildRun(childParams, {
      waitMode: 'blocking',
    })
    const record = await spawned.promise

    if (record.result?.hitlPaused && record.childRun) {
      parentRun.mergeChildHitlPause?.(record.childRun, record.result)
      throw new Error('Sub-agent paused for human approval')
    }

    if (record.status === 'failed' || record.status === 'cancelled') {
      throw new Error(record.error ?? `Sub-agent run ${record.runId} ${record.status}`)
    }

    return buildSubAgentBrief({
      runId: record.runId,
      agentId: record.agentId,
      agentName: record.agentName,
      status: (record.status as 'completed') || 'completed',
      stepOutputs: record.result?.stepOutputs as never,
      error: record.error,
      worktreePath: record.worktreePath,
      worktreeBranch: record.worktreeBranch,
      worktreeDiffStat: record.worktreeDiffStat,
      worktreeOutcome: record.worktreeOutcome,
    })
  },
}
