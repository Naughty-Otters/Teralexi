import type Database from 'better-sqlite3'
import { limitMessageContentForPersistence } from '@shared/persistence/limit-persisted-content'
import type { ConversationsRepository } from './conversations-repository'
import type { MessageSearchHit, StoredMessage } from './types'

export class MessagesRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly conversations: ConversationsRepository,
  ) {}

  count(conversationId: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?',
      )
      .get(conversationId) as { count: number }
    return row.count
  }

  /**
   * Returns the latest `limit` messages (chronological order) plus whether older
   * rows exist. Pass `before` (ISO created_at) to page into older history.
   */
  listPage(
    conversationId: string,
    opts: { before?: string; limit?: number } = {},
  ): { messages: StoredMessage[]; hasOlder: boolean } {
    const { before, limit = 40 } = opts
    const rows = before
      ? (this.db
          .prepare(
            `SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag
             FROM messages
             WHERE conversation_id = ? AND created_at < ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(conversationId, before, limit) as Array<RowShape>)
      : (this.db
          .prepare(
            `SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag
             FROM messages
             WHERE conversation_id = ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(conversationId, limit) as Array<RowShape>)

    const messages = rows.reverse().map(rowToMessage)
    if (messages.length === 0) {
      return { messages, hasOlder: false }
    }

    const oldest = messages[0]?.createdAt
    const olderRow = this.db
      .prepare(
        `SELECT 1 as ok FROM messages
         WHERE conversation_id = ? AND created_at < ?
         LIMIT 1`,
      )
      .get(conversationId, oldest) as { ok: number } | undefined

    return { messages, hasOlder: Boolean(olderRow?.ok) }
  }

  list(conversationId: string): StoredMessage[] {
    const rows = this.db
      .prepare(
        'SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      )
      .all(conversationId) as Array<{
      id: string
      conversation_id: string
      agent_id: string
      role: string
      content: string
      created_at: string
      thread_tag: string
    }>

    return rows.map(rowToMessage)
  }

  /**
   * Returns messages for a given thread tag, ordered ascending by created_at.
   * Pass `before` to limit to messages older than that ISO timestamp (for history injection).
   */
  listByThread(
    conversationId: string,
    threadTag: string,
    opts: { before?: string; limit?: number } = {},
  ): StoredMessage[] {
    const { before, limit = 20 } = opts
    const rows = before
      ? (this.db
          .prepare(
            `SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag
             FROM messages
             WHERE conversation_id = ? AND thread_tag = ? AND created_at < ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(conversationId, threadTag, before, limit) as Array<RowShape>)
      : (this.db
          .prepare(
            `SELECT id, conversation_id, agent_id, role, content, created_at, thread_tag
             FROM messages
             WHERE conversation_id = ? AND thread_tag = ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .all(conversationId, threadTag, limit) as Array<RowShape>)

    // Reverse so returned order is oldest-first (chronological)
    return rows.reverse().map(rowToMessage)
  }

  /** Returns the distinct thread tags present in a conversation and how many messages each has. */
  getThreadTagCounts(conversationId: string): Array<{ threadTag: string; count: number }> {
    const rows = this.db
      .prepare(
        `SELECT thread_tag, COUNT(*) as count FROM messages
         WHERE conversation_id = ?
         GROUP BY thread_tag
         ORDER BY count DESC`,
      )
      .all(conversationId) as Array<{ thread_tag: string; count: number }>
    return rows.map((r) => ({ threadTag: r.thread_tag, count: r.count }))
  }

  save(msg: StoredMessage): void {
    const content = limitMessageContentForPersistence(msg.content, msg.role)
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, agent_id, role, content, created_at, has_error, thread_tag)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(id) DO UPDATE SET
           conversation_id = excluded.conversation_id,
           agent_id = excluded.agent_id,
           role = excluded.role,
           content = excluded.content,
           created_at = excluded.created_at,
           has_error = 0,
           thread_tag = excluded.thread_tag`,
      )
      .run(
        msg.id,
        msg.conversationId,
        msg.agentId,
        msg.role,
        content,
        msg.createdAt,
        msg.threadTag ?? 'general',
      )
    this.conversations.touch(msg.conversationId)
  }

  update(id: string, content: string): void {
    const row = this.db
      .prepare('SELECT role FROM messages WHERE id = ?')
      .get(id) as { role: 'user' | 'assistant' } | undefined
    const role = row?.role ?? 'assistant'
    const limited = limitMessageContentForPersistence(content, role)
    this.db
      .prepare('UPDATE messages SET content = ?, has_error = 0 WHERE id = ?')
      .run(limited, id)
  }

  deleteByIds(ids: string[]): void {
    if (ids.length === 0) return
    const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?')
    const tx = this.db.transaction((messageIds: string[]) => {
      for (const id of messageIds) stmt.run(id)
    })
    tx(ids)
  }

  deleteAllForConversation(conversationId: string): void {
    this.db
      .prepare('DELETE FROM messages WHERE conversation_id = ?')
      .run(conversationId)
    this.conversations.touch(conversationId)
  }

  /**
   * Full-text search across message content via the messages_fts virtual table.
   * Scoped to a conversation when supplied; otherwise searches all messages.
   */
  search(
    query: string,
    opts: { conversationId?: string; agentId?: string; limit?: number } = {},
  ): MessageSearchHit[] {
    const { conversationId, agentId, limit = 20 } = opts

    const conditions: string[] = ['messages_fts MATCH ?']
    const params: unknown[] = [query]

    if (conversationId) {
      conditions.push('m.conversation_id = ?')
      params.push(conversationId)
    }
    if (agentId) {
      conditions.push('m.agent_id = ?')
      params.push(agentId)
    }
    params.push(limit)

    const sql = `
      SELECT m.id, m.conversation_id, m.agent_id, m.role, m.content,
             m.created_at, m.has_error, f.rank
      FROM messages_fts f
      JOIN messages m ON m.rowid = f.rowid
      WHERE ${conditions.join(' AND ')}
      ORDER BY f.rank
      LIMIT ?`

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string
      conversation_id: string
      agent_id: string
      role: string
      content: string
      created_at: string
      has_error: number
      rank: number
    }>

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      agentId: r.agent_id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      createdAt: r.created_at,
      rank: r.rank,
    }))
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RowShape {
  id: string
  conversation_id: string
  agent_id: string
  role: string
  content: string
  created_at: string
  thread_tag: string
}

function rowToMessage(r: RowShape): StoredMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    agentId: r.agent_id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    createdAt: r.created_at,
    threadTag: r.thread_tag || 'general',
  }
}
