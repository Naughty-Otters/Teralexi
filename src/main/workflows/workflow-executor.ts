import { createLogger } from '@main/logger'
import { ConfigContext } from '@main/agent/config/context'
import { getConversationStore } from '@main/services/conversation-store'
import { randomShortUuid } from '@shared/utils/short-uuid'
import type { WorkflowRunMode } from '@shared/workflows/deployment-target'
import { bindWorkflowInputs, type TriggerPayload } from '@shared/workflows/inputs'
import {
  loadWorkflowDefinitionByVersionId,
  loadWorkflowDefinitionFromVersion,
} from './workflow-store'
import { runWorkflowViaAgentFlow } from './workflow-agent-run'

const log = createLogger('workflows.executor')

export type WorkflowExecuteRequest = {
  workflowId: string
  versionId: string
  deploymentId?: string
  runMode: WorkflowRunMode
  trigger: TriggerPayload
  conversationId?: string
}

export type WorkflowExecuteResult = {
  runId: string
  conversationId: string
  success: boolean
  outputs: Record<string, unknown>
  errorMessage?: string
  compiledStageCount: number
}

export class WorkflowExecutor {
  async execute(request: WorkflowExecuteRequest): Promise<WorkflowExecuteResult> {
    const store = getConversationStore()
    const version = store.getWorkflowVersion(request.versionId)
    if (!version) {
      throw new Error('Workflow version not found')
    }

    const workflow = store.getWorkflow(request.workflowId)
    const userId = workflow?.userId ?? ConfigContext.DEFAULT_USER_ID

    const definition = loadWorkflowDefinitionFromVersion(version)
    if (request.runMode === 'production' && definition.status !== 'deployed') {
      if (workflow?.status !== 'deployed' && definition.status !== 'confirmed') {
        throw new Error('Workflow is not deployed for production execution')
      }
    }

    const inputs = bindWorkflowInputs(definition, request.trigger)

    const runId = randomShortUuid()
    const conversationId =
      request.conversationId ??
      `workflow:${request.workflowId}:${request.runMode}:${runId}`

    log.info('Executing workflow via AgentFlow', {
      workflowId: request.workflowId,
      versionId: request.versionId,
      runMode: request.runMode,
      conversationId,
      stepCount: definition.steps.length,
    })

    const result = await runWorkflowViaAgentFlow({
      userId,
      definition,
      inputs,
      conversationId,
      runId,
    })

    log.info('Workflow AgentFlow run finished', {
      success: result.success,
      hitlPaused: result.hitlPaused,
      stepOutputKeys: Object.keys(result.stepOutputs),
    })

    if (request.deploymentId) {
      store.setWorkflowDeploymentLastRun(
        request.deploymentId,
        new Date().toISOString(),
        result.success ? null : (result.errorMessage ?? 'Workflow run failed'),
      )
    }

    return {
      runId,
      conversationId,
      success: result.success,
      outputs: { ...inputs, ...result.stepOutputs },
      ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
      compiledStageCount: definition.steps.length,
    }
  }
}

let executorSingleton: WorkflowExecutor | null = null

export function getWorkflowExecutor(): WorkflowExecutor {
  if (!executorSingleton) {
    executorSingleton = new WorkflowExecutor()
  }
  return executorSingleton
}

export async function runWorkflowManual(args: {
  workflowId: string
  versionId?: string
  inputs?: Record<string, unknown>
  runMode?: WorkflowRunMode
}): Promise<WorkflowExecuteResult> {
  const store = getConversationStore()
  const workflow = store.getWorkflow(args.workflowId)
  if (!workflow) {
    throw new Error('Workflow not found')
  }

  const versionId =
    args.versionId ??
    workflow.currentVersionId ??
    store.listWorkflowVersions(args.workflowId)[0]?.id

  if (!versionId) {
    throw new Error('No workflow version available')
  }

  return getWorkflowExecutor().execute({
    workflowId: args.workflowId,
    versionId,
    runMode: args.runMode ?? 'production',
    trigger: { type: 'manual', inputs: args.inputs },
  })
}

export function loadDefinitionForVersion(versionId: string) {
  return loadWorkflowDefinitionByVersionId(versionId)
}
