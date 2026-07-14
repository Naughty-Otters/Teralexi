import type Database from 'better-sqlite3'
import type { StoredConversation } from './types'

export class ConversationsRepository {
  constructor(private readonly db: Database.Database) {}

  list(agentId: string): StoredConversation[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.agent_id, c.title, c.created_at, c.updated_at,
                s.workspace_path
         FROM conversations c
         LEFT JOIN conversation_settings s ON s.conversation_id = c.id
         WHERE c.agent_id = ?
         ORDER BY c.updated_at DESC`,
      )
      .all(agentId) as Array<{
      id: string
      agent_id: string
      title: string
      created_at: string
      updated_at: string
      workspace_path: string | null
    }>

    return rows.map((r) => ({
      id: r.id,
      agentId: r.agent_id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      workspacePath: r.workspace_path?.trim() || null,
    }))
  }

  get(conversationId: string): StoredConversation | null {
    const row = this.db
      .prepare(
        'SELECT id, agent_id, title, created_at, updated_at FROM conversations WHERE id = ?',
      )
      .get(conversationId) as
      | {
          id: string
          agent_id: string
          title: string
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null
    return {
      id: row.id,
      agentId: row.agent_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  create(conv: StoredConversation): StoredConversation {
    this.db
      .prepare(
        `INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(conv.id, conv.agentId, conv.title, conv.createdAt, conv.updatedAt)
    return conv
  }

  updateTitle(conversationId: string, title: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, now, conversationId)
  }

  updateAgentId(conversationId: string, agentId: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        'UPDATE conversations SET agent_id = ?, updated_at = ? WHERE id = ?',
      )
      .run(agentId, now, conversationId)
  }

  touch(conversationId: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now, conversationId)
  }

  delete(conversationId: string): void {
    // CASCADE handles messages and conversation_sandbox_runs
    this.db
      .prepare('DELETE FROM conversations WHERE id = ?')
      .run(conversationId)
  }
}
