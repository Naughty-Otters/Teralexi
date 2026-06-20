import type Database from 'better-sqlite3'
import type {
  StoredSchedulerActionType,
  StoredSchedulerDefinition,
  StoredSchedulerType,
} from './types'

type SchedulerRow = {
  id: string
  user_id: string
  name: string
  enabled: number
  schedule_type: string
  interval_ms: number | null
  cron_expression: string | null
  timezone: string | null
  action_type: string
  channel_id: string
  target: string
  message: string
  agent_id: string
  conversation_id: string
  prompt: string
  workflow_id: string
  last_run_at: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: SchedulerRow): StoredSchedulerDefinition {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    enabled: row.enabled !== 0,
    scheduleType: row.schedule_type as StoredSchedulerType,
    intervalMs: row.interval_ms,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    actionType: row.action_type as StoredSchedulerActionType,
    channelId: row.channel_id,
    target: row.target,
    message: row.message,
    agentId: row.agent_id,
    conversationId: row.conversation_id,
    prompt: row.prompt,
    workflowId: row.workflow_id ?? '',
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SchedulersRepository {
  constructor(private readonly db: Database.Database) {}

  list(userId: string): StoredSchedulerDefinition[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          user_id,
          name,
          enabled,
          schedule_type,
          interval_ms,
          cron_expression,
          timezone,
          action_type,
          channel_id,
          target,
          message,
          agent_id,
          conversation_id,
          prompt,
          workflow_id,
          last_run_at,
          created_at,
          updated_at
         FROM schedulers
         WHERE user_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(userId) as SchedulerRow[]

    return rows.map(mapRow)
  }

  upsert(
    scheduler: Omit<
      StoredSchedulerDefinition,
      'createdAt' | 'updatedAt' | 'lastRunAt'
    >,
  ): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO schedulers (
          id,
          user_id,
          name,
          enabled,
          schedule_type,
          interval_ms,
          cron_expression,
          timezone,
          action_type,
          channel_id,
          target,
          message,
          agent_id,
          conversation_id,
          prompt,
          workflow_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id)
        DO UPDATE SET
          user_id = excluded.user_id,
          name = excluded.name,
          enabled = excluded.enabled,
          schedule_type = excluded.schedule_type,
          interval_ms = excluded.interval_ms,
          cron_expression = excluded.cron_expression,
          timezone = excluded.timezone,
          action_type = excluded.action_type,
          channel_id = excluded.channel_id,
          target = excluded.target,
          message = excluded.message,
            agent_id = excluded.agent_id,
            conversation_id = excluded.conversation_id,
            prompt = excluded.prompt,
            workflow_id = excluded.workflow_id,
          updated_at = excluded.updated_at`,
      )
      .run(
        scheduler.id,
        scheduler.userId,
        scheduler.name,
        scheduler.enabled ? 1 : 0,
        scheduler.scheduleType,
        scheduler.intervalMs,
        scheduler.cronExpression,
        scheduler.timezone,
        scheduler.actionType,
        scheduler.channelId,
        scheduler.target,
        scheduler.message,
        scheduler.agentId,
        scheduler.conversationId,
        scheduler.prompt,
        scheduler.workflowId ?? '',
        now,
        now,
      )
  }

  delete(userId: string, schedulerId: string): void {
    this.db
      .prepare('DELETE FROM schedulers WHERE user_id = ? AND id = ?')
      .run(userId, schedulerId)
  }

  setLastRunAt(schedulerId: string, ranAtIso: string): void {
    this.db
      .prepare(
        'UPDATE schedulers SET last_run_at = ?, updated_at = ? WHERE id = ?',
      )
      .run(ranAtIso, ranAtIso, schedulerId)
  }

  setConversationId(schedulerId: string, conversationId: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        'UPDATE schedulers SET conversation_id = ?, updated_at = ? WHERE id = ?',
      )
      .run(conversationId, now, schedulerId)
  }
}
