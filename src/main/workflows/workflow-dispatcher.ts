import { getConversationStore } from '@main/services/conversation-store'
import { createLogger } from '@main/logger'
import { randomShortUuid } from '@shared/utils/short-uuid'
import {
  matchChannelMessageTrigger,
  type TriggerPayload,
} from '@shared/workflows/inputs'
import type { WorkflowDefinition, WorkflowTrigger } from '@shared/workflows/schema'
import { parseWorkflowDefinition } from '@shared/workflows/schema'
import { getWorkflowExecutor } from './workflow-executor'
import { loadWorkflowDefinitionFromVersion } from './workflow-store'
import { getSchedulerManager } from '@main/services/scheduler-manager'

const log = createLogger('workflows.dispatcher')

export type WorkflowDispatchResult = {
  dispatched: boolean
  workflowId?: string
  deploymentId?: string
  runId?: string
  errorMessage?: string
}

function triggerToRow(
  workflowId: string,
  deploymentId: string,
  trigger: WorkflowTrigger,
): {
  id: string
  triggerType: string
  configJson: string
  enabled: boolean
} {
  return {
    id: `wft-${randomShortUuid()}`,
    triggerType: trigger.type,
    configJson: JSON.stringify(trigger),
    enabled: true,
  }
}

export class WorkflowDispatcher {
  async dispatch(
    workflowId: string,
    deploymentId: string,
    versionId: string,
    trigger: TriggerPayload,
  ): Promise<WorkflowDispatchResult> {
    const deployment = getConversationStore().getWorkflowDeployment(deploymentId)
    if (!deployment?.enabled) {
      return { dispatched: false, errorMessage: 'Deployment is disabled' }
    }

    try {
      const result = await getWorkflowExecutor().execute({
        workflowId,
        versionId,
        deploymentId,
        runMode: 'production',
        trigger,
      })
      return {
        dispatched: result.success,
        workflowId,
        deploymentId,
        runId: result.runId,
        ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      log.error('Workflow dispatch failed', { workflowId, deploymentId, err })
      return { dispatched: false, workflowId, deploymentId, errorMessage }
    }
  }

  async dispatchManual(
    workflowId: string,
    inputs?: Record<string, unknown>,
  ): Promise<WorkflowDispatchResult> {
    const store = getConversationStore()
    const workflow = store.getWorkflow(workflowId)
    if (!workflow) {
      return { dispatched: false, errorMessage: 'Workflow not found' }
    }

    const deployment = store.listWorkflowDeployments(workflowId).find((d) => d.enabled)
    const versionId =
      deployment?.versionId ??
      workflow.currentVersionId ??
      store.listWorkflowVersions(workflowId)[0]?.id

    if (!versionId) {
      return { dispatched: false, errorMessage: 'No workflow version' }
    }

    return this.dispatch(
      workflowId,
      deployment?.id ?? `manual-${workflowId}`,
      versionId,
      { type: 'manual', inputs },
    )
  }

  tryDispatchChannelMessage(args: {
    channelId: string
    senderId: string
    text: string
    occurredAtIso: string
  }): Promise<WorkflowDispatchResult> {
    const store = getConversationStore()
    const triggers = store.listEnabledChannelMessageWorkflowTriggers()

    for (const row of triggers) {
      const deployment = row.deploymentId
        ? store.getWorkflowDeployment(row.deploymentId)
        : null
      if (deployment && !deployment.enabled) continue

      const version = deployment
        ? store.getWorkflowVersion(deployment.versionId)
        : store.listWorkflowVersions(row.workflowId)[0]

      if (!version) continue

      const definition = loadWorkflowDefinitionFromVersion(version)
      const matched = matchChannelMessageTrigger(
        definition,
        args.channelId,
        args.text,
      )
      if (!matched) continue

      return this.dispatch(
        row.workflowId,
        deployment?.id ?? `channel-${row.workflowId}`,
        version.id,
        {
          type: 'channel_message',
          channelId: args.channelId,
          senderId: args.senderId,
          text: args.text,
          occurredAt: args.occurredAtIso,
        },
      )
    }

    return { dispatched: false }
  }
}

let dispatcherSingleton: WorkflowDispatcher | null = null

export function getWorkflowDispatcher(): WorkflowDispatcher {
  if (!dispatcherSingleton) {
    dispatcherSingleton = new WorkflowDispatcher()
  }
  return dispatcherSingleton
}

export async function registerWorkflowTriggersForDeployment(args: {
  workflowId: string
  deploymentId: string
  definition: WorkflowDefinition
}): Promise<void> {
  const store = getConversationStore()
  const rows = (args.definition.triggers ?? [{ type: 'manual' as const }]).map(
    (trigger) => triggerToRow(args.workflowId, args.deploymentId, trigger),
  )
  store.replaceWorkflowTriggers(args.workflowId, args.deploymentId, rows)

  for (const trigger of args.definition.triggers ?? []) {
    if (trigger.type !== 'schedule') continue
    const schedulerId = `wf-sched-${args.deploymentId}`
    store.upsertScheduler({
      id: schedulerId,
      userId: 'default',
      name: `Workflow ${args.workflowId}`,
      enabled: true,
      scheduleType: 'cron',
      intervalMs: null,
      cronExpression: trigger.cron,
      timezone: trigger.timezone ?? null,
      actionType: 'run-workflow',
      channelId: '',
      target: '',
      message: '',
      agentId: args.definition.executor.agentId,
      conversationId: '',
      prompt: '',
      workflowId: args.workflowId,
    })
    getSchedulerManager().upsertSchedule(schedulerId, 'default')
  }
}

export async function undeployWorkflowTriggers(
  deploymentId: string,
  workflowId: string,
): Promise<void> {
  getConversationStore().replaceWorkflowTriggers(workflowId, deploymentId, [])
  getSchedulerManager().removeSchedule(`wf-sched-${deploymentId}`)
}

export function parseStoredWorkflowDefinition(json: string): WorkflowDefinition {
  return parseWorkflowDefinition(JSON.parse(json))
}
