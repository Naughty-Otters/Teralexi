import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  assertRootSubAgentDelegation,
  buildSubAgentChildParams,
  isSubAgentIdAllowed,
  resolveSubAgentTargetIdFromDelegation,
} from './delegation-context'
import { INVOKE_AGENT_TOOL_NAME, SUB_AGENT_TAG } from './constants'

export const invokeAgent: SkillTool = {
  name: INVOKE_AGENT_TOOL_NAME,
  tags: [...SUB_AGENT_TAG],
  description:
    'Delegate a sub-task to another configured agent. Returns the sub-agent report or summary. ' +
    'Set wait=false to run in parallel and receive a runId; use wait_for_sub_agent_runs to collect results.',
  inputSchema: z.object({
    agentId: z.string().min(1).describe('Catalog agent id to run'),
    task: z.string().min(1).describe('Task for the sub-agent'),
    wait: z
      .boolean()
      .optional()
      .describe('When false, start in background and return runId immediately'),
  }),
  needsApproval: false,
  async execute(input) {
    const parsed = z
      .object({
        agentId: z.string(),
        task: z.string(),
        wait: z.boolean().optional(),
      })
      .safeParse(input)
    if (!parsed.success) {
      return { error: 'Invalid invoke_agent input.', detail: parsed.error.flatten() }
    }

    const delegation = assertRootSubAgentDelegation()
    if (!delegation.allowSubAgents) {
      throw new Error('invoke_agent is not enabled for this agent')
    }

    const { agentId, task, wait = true } = parsed.data
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
      })
      return {
        runId: spawned.runId,
        agentId: spawned.agentId,
        agentName: spawned.agentName,
        background: true,
      }
    }

    const result = await parentRun.executeChildAndMerge(childParams)
    if (result.hitlPaused) {
      throw new Error('Sub-agent paused for human approval')
    }
    const { mergeSubFlowOutputText } = await import(
      '@main/agent/run/resolve-child-agent'
    )
    return mergeSubFlowOutputText(result.stepOutputs, 'report')
  },
}
