import type {
  DeployConfig,
  DeployHandle,
  DeployStatus,
  WorkflowDeploymentTarget,
} from '@shared/workflows/deployment-target'
import type { WorkflowDefinition } from '@shared/workflows/schema'

/**
 * Stub deployment target for the future agent-server runtime.
 * Phase D will implement HTTP pull + webhook triggers against a remote service.
 */
export class AgentServerWorkflowDeploymentTarget
  implements WorkflowDeploymentTarget
{
  readonly kind = 'agent-server' as const

  async deploy(
    versionId: string,
    definition: WorkflowDefinition,
    config: DeployConfig,
  ): Promise<DeployHandle> {
    void config
    throw new Error(
      `Agent-server deployment is not implemented yet (workflow=${definition.id}, version=${versionId}). Use local deployment for now.`,
    )
  }

  async undeploy(deploymentId: string): Promise<void> {
    void deploymentId
    throw new Error('Agent-server undeploy is not implemented yet')
  }

  async status(deploymentId: string): Promise<DeployStatus> {
    return {
      deploymentId,
      kind: 'agent-server',
      enabled: false,
      lastRunAt: null,
      lastError: 'Agent-server runtime not connected',
    }
  }
}

let agentServerTarget: AgentServerWorkflowDeploymentTarget | null = null

export function getAgentServerWorkflowDeploymentTarget(): AgentServerWorkflowDeploymentTarget {
  if (!agentServerTarget) {
    agentServerTarget = new AgentServerWorkflowDeploymentTarget()
  }
  return agentServerTarget
}

import { getLocalWorkflowDeploymentTarget } from './local'

export function resolveWorkflowDeploymentTarget(
  kind: 'local' | 'agent-server',
): WorkflowDeploymentTarget {
  if (kind === 'agent-server') {
    return getAgentServerWorkflowDeploymentTarget()
  }
  return getLocalWorkflowDeploymentTarget()
}
