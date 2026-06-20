import { getConversationStore } from '@main/services/conversation-store'
import { createLogger } from '@main/logger'
import { randomShortUuid } from '@shared/utils/short-uuid'
import type {
  DeployConfig,
  DeployHandle,
  DeployStatus,
  WorkflowDeploymentTarget,
} from '@shared/workflows/deployment-target'
import type { WorkflowDefinition } from '@shared/workflows/schema'
import {
  registerWorkflowTriggersForDeployment,
  undeployWorkflowTriggers,
} from '../workflow-dispatcher'

const log = createLogger('workflows.deployment.local')

export class LocalWorkflowDeploymentTarget implements WorkflowDeploymentTarget {
  readonly kind = 'local' as const

  async deploy(
    versionId: string,
    definition: WorkflowDefinition,
    config: DeployConfig,
  ): Promise<DeployHandle> {
    const store = getConversationStore()
    const workflow = store.getWorkflow(definition.id)
    if (!workflow) {
      throw new Error(`Workflow not found: ${definition.id}`)
    }

    const deploymentId = `wfd-${randomShortUuid()}`
    store.upsertWorkflowDeployment({
      id: deploymentId,
      workflowId: definition.id,
      versionId,
      userId: workflow.userId,
      target: 'local',
      enabled: config.enabled,
      configJson: JSON.stringify({
        workspacePath: config.workspacePath ?? null,
      }),
    })

    const deployedDefinition: WorkflowDefinition = {
      ...definition,
      status: 'deployed',
    }

    store.upsertWorkflow({
      ...workflow,
      status: 'deployed',
      currentVersionId: versionId,
    })

    await registerWorkflowTriggersForDeployment({
      workflowId: definition.id,
      deploymentId,
      definition: deployedDefinition,
    })

    log.info('Deployed workflow locally', {
      workflowId: definition.id,
      deploymentId,
      versionId,
    })

    return {
      deploymentId,
      kind: 'local',
      workflowId: definition.id,
      versionId,
    }
  }

  async undeploy(deploymentId: string): Promise<void> {
    const store = getConversationStore()
    const deployment = store.getWorkflowDeployment(deploymentId)
    if (!deployment) return

    await undeployWorkflowTriggers(deploymentId, deployment.workflowId)
    store.deleteWorkflowDeployment(deploymentId)

    const workflow = store.getWorkflow(deployment.workflowId)
    if (workflow?.status === 'deployed') {
      store.upsertWorkflow({
        ...workflow,
        status: 'confirmed',
      })
    }
  }

  async status(deploymentId: string): Promise<DeployStatus> {
    const deployment = getConversationStore().getWorkflowDeployment(deploymentId)
    if (!deployment) {
      throw new Error('Deployment not found')
    }
    return {
      deploymentId,
      kind: 'local',
      enabled: deployment.enabled,
      lastRunAt: deployment.lastRunAt,
      lastError: deployment.lastError,
    }
  }
}

let localTarget: LocalWorkflowDeploymentTarget | null = null

export function getLocalWorkflowDeploymentTarget(): LocalWorkflowDeploymentTarget {
  if (!localTarget) {
    localTarget = new LocalWorkflowDeploymentTarget()
  }
  return localTarget
}

export async function deployWorkflowLocally(args: {
  workflowId: string
  versionId: string
  config?: DeployConfig
}): Promise<DeployHandle> {
  const store = getConversationStore()
  const version = store.getWorkflowVersion(args.versionId)
  if (!version) {
    throw new Error('Workflow version not found')
  }

  const definition = JSON.parse(version.definitionJson) as WorkflowDefinition
  return getLocalWorkflowDeploymentTarget().deploy(
    args.versionId,
    definition,
    args.config ?? { enabled: true },
  )
}
