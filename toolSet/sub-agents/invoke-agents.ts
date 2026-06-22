import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  assertRootSubAgentDelegation,
  buildSubAgentChildParams,
  isSubAgentIdAllowed,
  resolveSubAgentTargetIdFromDelegation,
} from './delegation-context'
import { INVOKE_AGENTS_TOOL_NAME, SUB_AGENT_TAG } from './constants'
import { mergeSubFlowOutputText } from '@main/agent/run/sub-flow-output-text'

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
    .describe('When false, return runIds immediately without blocking'),
})

export const invokeAgents: SkillTool = {
  name: INVOKE_AGENTS_TOOL_NAME,
  tags: [...SUB_AGENT_TAG],
  description:
    'Delegate multiple sub-tasks to configured agents in parallel. ' +
    'Use wait=false to start all runs and collect results later with wait_for_sub_agent_runs.',
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

    const { runs, wait = true } = parsed.data
    const spawned: Array<{ runId: string; agentId: string; agentName: string }> = []

    for (const run of runs) {
      const requestedId = run.agentId.trim()
      if (!requestedId) continue

      const resolvedId = await resolveSubAgentTargetIdFromDelegation(
        delegation,
        requestedId,
      )
      if (
        !isSubAgentIdAllowed(requestedId, resolvedId, delegation.subAgentIds)
      ) {
        throw new Error(`Agent "${requestedId}" is not enabled for invoke_agents`)
      }

      const entry = await parentRun.spawnChildRun(
        buildSubAgentChildParams(delegation, {
          agentId: resolvedId,
          task: run.task.trim(),
        }),
        { waitMode: wait ? 'blocking' : 'background' },
      )
      spawned.push(entry)
    }

    if (!wait) {
      return { runIds: spawned.map((s) => s.runId), runs: spawned }
    }

    if (!parentRun.waitForChildRuns) {
      throw new Error('invoke_agents wait mode requires waitForChildRuns')
    }

    const results = await parentRun.waitForChildRuns(spawned.map((s) => s.runId))
    return {
      results: results.map((result, i) => ({
        runId: spawned[i]?.runId,
        agentId: spawned[i]?.agentId,
        report: mergeSubFlowOutputText(result.stepOutputs, 'report'),
        hitlPaused: result.hitlPaused,
      })),
    }
  },
}
