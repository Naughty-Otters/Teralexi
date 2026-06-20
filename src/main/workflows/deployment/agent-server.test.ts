import { describe, expect, it } from 'vitest'
import { AgentServerWorkflowDeploymentTarget } from './agent-server'
import { parseWorkflowDefinition, WORKFLOW_DEFINITION_VERSION } from '@shared/workflows/schema'

describe('AgentServerWorkflowDeploymentTarget', () => {
  it('throws not implemented on deploy', async () => {
    const target = new AgentServerWorkflowDeploymentTarget()
    const definition = parseWorkflowDefinition({
      version: WORKFLOW_DEFINITION_VERSION,
      id: 'wf-remote',
      name: 'Remote',
      status: 'confirmed',
      executor: { agentId: 'skill:default' },
      steps: [{ id: 's1', type: 'task' }],
    })
    await expect(
      target.deploy('v1', definition, { enabled: true }),
    ).rejects.toThrow(/not implemented/i)
  })

  it('returns stub status', async () => {
    const target = new AgentServerWorkflowDeploymentTarget()
    const status = await target.status('dep-1')
    expect(status.kind).toBe('agent-server')
    expect(status.enabled).toBe(false)
  })
})
