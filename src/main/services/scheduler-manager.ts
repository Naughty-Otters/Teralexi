import {
  AsyncTask,
  CronJob,
  SimpleIntervalJob,
  ToadScheduler,
} from 'toad-scheduler'
import {
  getConversationStore,
  type StoredSchedulerDefinition,
} from './conversation-store'
import { getChannelRegistry } from '@main/channels/framework/channel-registry'
import { runAgentForConversation } from '@main/engine'
import { serializeAssistantMessageForExternalReply } from '@main/agent/utils'
import { notifyConversationStoreChanged } from '@main/services/conversation-store-notify'
import { resolveSchedulerSessionId } from '@shared/conversation/session-id'
import { randomShortUuid } from '@shared/utils/short-uuid'
import { extractThreadTag } from '@main/agent/expr/thread-tagger'
import { ConfigContext } from '@main/agent/config/context'
import { createLogger, instrumentInstanceMethods } from '@main/logger'
import { getWorkflowDispatcher } from '@main/workflows/workflow-dispatcher'

const log = createLogger('services.scheduler-manager')

class SchedulerManager {
  private readonly scheduler = new ToadScheduler()
  private readonly registeredIds = new Set<string>()
  private started = false

  ensureStarted(): void {
    if (this.started) return
    this.started = true
    this.reloadAllFromStore()
  }

  stop(): void {
    this.scheduler.stop()
    this.registeredIds.clear()
    this.started = false
  }

  reloadAllFromStore(): void {
    for (const id of this.registeredIds) {
      this.scheduler.removeById(id)
    }
    this.registeredIds.clear()

    const schedules = getConversationStore().listSchedulers('default')
    for (const schedule of schedules) {
      this.registerSchedule(schedule)
    }
  }

  upsertSchedule(scheduleId: string, userId = 'default'): void {
    this.scheduler.removeById(scheduleId)
    this.registeredIds.delete(scheduleId)

    const schedules = getConversationStore().listSchedulers(userId)
    const schedule = schedules.find((item) => item.id === scheduleId)
    if (!schedule) return
    this.registerSchedule(schedule)
  }

  removeSchedule(scheduleId: string): void {
    this.scheduler.removeById(scheduleId)
    this.registeredIds.delete(scheduleId)
  }

  private registerSchedule(schedule: StoredSchedulerDefinition): void {
    if (!schedule.enabled) return

    const task = new AsyncTask(
      `schedule-${schedule.id}`,
      async () => {
        await this.executeScheduleAction(schedule)
      },
      (error) => {
        log.error('Scheduler task failed', {
          scheduleId: schedule.id,
          err: error,
        })
      },
    )

    if (schedule.scheduleType === 'interval') {
      const milliseconds = schedule.intervalMs ?? 0
      if (milliseconds < 1000) {
        log.warn('Skipping invalid interval schedule', {
          scheduleId: schedule.id,
          milliseconds,
        })
        return
      }
      const job = new SimpleIntervalJob({ milliseconds }, task, {
        id: schedule.id,
        preventOverrun: true,
      })
      this.scheduler.addSimpleIntervalJob(job)
      this.registeredIds.add(schedule.id)
      return
    }

    if (schedule.scheduleType === 'cron') {
      const expression = schedule.cronExpression?.trim()
      if (!expression) {
        log.warn('Skipping cron schedule with missing expression', {
          scheduleId: schedule.id,
        })
        return
      }
      const job = new CronJob(
        {
          cronExpression: expression,
          timezone: schedule.timezone?.trim() || undefined,
        },
        task,
        { id: schedule.id, preventOverrun: true },
      )
      this.scheduler.addCronJob(job)
      this.registeredIds.add(schedule.id)
    }
  }

  private async executeScheduleAction(
    schedule: StoredSchedulerDefinition,
  ): Promise<void> {
    log.info('Executing scheduler action', {
      scheduleId: schedule.id,
      actionType: schedule.actionType,
      channelId: schedule.channelId,
    })

    if (schedule.actionType === 'send-channel-message') {
      const sender = getChannelRegistry().get(schedule.channelId)
      if (!sender) {
        throw new Error(`Unknown channel: ${schedule.channelId}`)
      }
      await sender.sendToTarget(schedule.target, schedule.message)
    }

    if (schedule.actionType === 'run-agent') {
      const conversationId = resolveSchedulerSessionId(schedule)
      const prompt = schedule.prompt.trim()
      const agentId = schedule.agentId.trim()
      if (!agentId) {
        throw new Error('Agent id is required for run-agent scheduler action')
      }
      if (!prompt) {
        throw new Error('Prompt is required for run-agent scheduler action')
      }

      const store = getConversationStore()
      if (!schedule.conversationId.trim()) {
        store.setSchedulerConversationId(schedule.id, conversationId)
      }

      const existingConversation = store.getConversation(conversationId)
      if (!existingConversation) {
        const now = new Date().toISOString()
        store.createConversation({
          id: conversationId,
          agentId,
          title: `Scheduler: ${schedule.name}`,
          createdAt: now,
          updatedAt: now,
        })
      }

      store.saveMessage({
        id: randomShortUuid(),
        conversationId,
        agentId,
        role: 'user',
        content: prompt,
        createdAt: new Date().toISOString(),
        threadTag: extractThreadTag(prompt),
      })

      notifyConversationStoreChanged(conversationId, agentId)

      await runAgentForConversation({
        conversationId,
        agentId,
        assistantMessageId: randomShortUuid(),
        userId: ConfigContext.DEFAULT_USER_ID,
      })

      const channelId = schedule.channelId.trim()
      const target = schedule.target.trim()
      if (channelId && target) {
        const messages = store.getMessages(conversationId)
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.role === 'assistant' && m.content.trim())
        if (lastAssistant) {
          const replyText = serializeAssistantMessageForExternalReply(
            lastAssistant.content,
          )
          if (replyText.trim()) {
            const sender = getChannelRegistry().get(channelId)
            if (!sender) {
              throw new Error(`Unknown channel: ${channelId}`)
            }
            await sender.sendToTarget(target, replyText)
          }
        }
      }

      notifyConversationStoreChanged(conversationId, agentId)
    }

    if (schedule.actionType === 'run-workflow') {
      const workflowId = schedule.workflowId.trim()
      if (!workflowId) {
        throw new Error('Workflow id is required for run-workflow scheduler action')
      }
      await getWorkflowDispatcher().dispatchManual(workflowId)
    }

    const now = new Date().toISOString()
    getConversationStore().setSchedulerLastRunAt(schedule.id, now)
  }
}

let manager: SchedulerManager | null = null

export function getSchedulerManager(): SchedulerManager {
  if (!manager) {
    manager = instrumentInstanceMethods(new SchedulerManager(), log)
  }
  return manager
}
