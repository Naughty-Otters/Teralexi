import type Database from 'better-sqlite3'
import type { StoredToolResult, ToolResultSearchHit } from './types'

type ToolResultRow = {
  id: string
  conversation_id: string
  agent_id: string
  step_id: string
  tool_name: string
  input_summary: string
  output_text: string
  output_summary: string
  output_chars: number
  is_error: number
  created_at: string
  thread_tag?: string
}

function rowToRecord(r: ToolResultRow): StoredToolResult {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    agentId: r.agent_id,
    stepId: r.step_id,
    toolName: r.tool_name,
    inputSummary: r.input_summary,
    outputText: r.output_text,
    outputSummary: r.output_summary,
    outputChars: r.output_chars,
    isError: r.is_error !== 0,
    createdAt: r.created_at,
    threadTag: r.thread_tag || 'general',
  }
}

export class ToolResultsRepository {
  constructor(private readonly db: Database.Database) {}

  save(result: StoredToolResult): void {
    this.db
      .prepare(
        `INSERT INTO tool_results
           (id, conversation_id, agent_id, step_id, tool_name,
            input_summary, output_text, output_summary, output_chars,
            is_error, created_at, thread_tag)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(
        result.id,
        result.conversationId,
        result.agentId,
        result.stepId,
        result.toolName,
        result.inputSummary,
        result.outputText,
        result.outputSummary,
        result.outputChars,
        result.isError ? 1 : 0,
        result.createdAt,
        result.threadTag ?? 'general',
      )
  }

  list(
    conversationId: string,
    opts: { limit?: number; toolName?: string; threadTag?: string } = {},
  ): StoredToolResult[] {
    const { limit = 200, toolName, threadTag } = opts
    let sql =
      `SELECT id, conversation_id, agent_id, step_id, tool_name,
              input_summary, output_text, output_summary, output_chars, is_error, created_at, thread_tag
       FROM tool_results
       WHERE conversation_id = ?`
    const params: unknown[] = [conversationId]

    if (toolName) {
      sql += ' AND tool_name = ?'
      params.push(toolName)
    }
    if (threadTag) {
      sql += ' AND thread_tag = ?'
      params.push(threadTag)
    }
    sql += ' ORDER BY created_at ASC LIMIT ?'
    params.push(limit)

    return (this.db.prepare(sql).all(...params) as ToolResultRow[]).map(rowToRecord)
  }

  /**
   * Return all results older than the last `keepRecentN` for this conversation.
   * If `currentThreadTag` is supplied, results for other threads get an
   * additional offset so they are pruned earlier than same-thread results.
   */
  getOlderThan(
    conversationId: string,
    keepRecentN: number,
    opts: { currentThreadTag?: string; crossThreadKeepN?: number } = {},
  ): StoredToolResult[] {
    const { currentThreadTag, crossThreadKeepN } = opts

    if (currentThreadTag && crossThreadKeepN !== undefined) {
      // Fetch same-thread older results
      const sameThread = this.db
        .prepare(
          `SELECT id, conversation_id, agent_id, step_id, tool_name,
                  input_summary, output_text, output_summary, output_chars, is_error, created_at, thread_tag
           FROM tool_results
           WHERE conversation_id = ? AND thread_tag = ?
           ORDER BY created_at DESC
           LIMIT -1 OFFSET ?`,
        )
        .all(conversationId, currentThreadTag, keepRecentN) as ToolResultRow[]

      // Fetch cross-thread older results (more aggressive offset)
      const crossThread = this.db
        .prepare(
          `SELECT id, conversation_id, agent_id, step_id, tool_name,
                  input_summary, output_text, output_summary, output_chars, is_error, created_at, thread_tag
           FROM tool_results
           WHERE conversation_id = ? AND thread_tag != ?
           ORDER BY created_at DESC
           LIMIT -1 OFFSET ?`,
        )
        .all(conversationId, currentThreadTag, crossThreadKeepN) as ToolResultRow[]

      return [...sameThread, ...crossThread].map(rowToRecord)
    }

    const rows = this.db
      .prepare(
        `SELECT id, conversation_id, agent_id, step_id, tool_name,
                input_summary, output_text, output_summary, output_chars, is_error, created_at, thread_tag
         FROM tool_results
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT -1 OFFSET ?`,
      )
      .all(conversationId, keepRecentN) as ToolResultRow[]
    return rows.map(rowToRecord)
  }

  /**
   * Full-text search across tool_name, input_summary, and output_text.
   * Scoped to a single conversation when conversationId is supplied.
   */
  search(
    query: string,
    opts: { conversationId?: string; limit?: number } = {},
  ): ToolResultSearchHit[] {
    const { conversationId, limit = 20 } = opts

    const sql = conversationId
      ? `SELECT t.id, t.conversation_id, t.agent_id, t.step_id, t.tool_name,
                t.input_summary, t.output_text, t.output_summary, t.output_chars,
                t.is_error, t.created_at, t.thread_tag,
                f.rank
         FROM tool_results_fts f
         JOIN tool_results t ON t.rowid = f.rowid
         WHERE tool_results_fts MATCH ?
           AND t.conversation_id = ?
         ORDER BY f.rank
         LIMIT ?`
      : `SELECT t.id, t.conversation_id, t.agent_id, t.step_id, t.tool_name,
                t.input_summary, t.output_text, t.output_summary, t.output_chars,
                t.is_error, t.created_at, t.thread_tag,
                f.rank
         FROM tool_results_fts f
         JOIN tool_results t ON t.rowid = f.rowid
         WHERE tool_results_fts MATCH ?
         ORDER BY f.rank
         LIMIT ?`

    const params = conversationId
      ? [query, conversationId, limit]
      : [query, limit]

    const rows = this.db.prepare(sql).all(...params) as Array<
      ToolResultRow & { rank: number }
    >
    return rows.map((r) => ({ ...rowToRecord(r), rank: r.rank }))
  }

  deleteAllForConversation(conversationId: string): void {
    this.db
      .prepare('DELETE FROM tool_results WHERE conversation_id = ?')
      .run(conversationId)
  }
}
