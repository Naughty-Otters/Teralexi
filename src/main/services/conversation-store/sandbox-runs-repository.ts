import type Database from 'better-sqlite3'
import type { StoredConversationSandboxRun } from './types'

export class SandboxRunsRepository {
  constructor(private readonly db: Database.Database) {}

  /** Insert or update a sandbox run (same `sandbox_root` = same run, URL updates). */
  upsert(payload: {
    conversationId: string
    sandboxRoot: string
    resultsFileUrl: string
    outputResultsDir: string
  }): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO conversation_sandbox_runs (
          sandbox_root, conversation_id, results_file_url, output_results_dir, created_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(sandbox_root) DO UPDATE SET
          results_file_url = excluded.results_file_url,
          output_results_dir = excluded.output_results_dir`,
      )
      .run(
        payload.sandboxRoot,
        payload.conversationId,
        payload.resultsFileUrl,
        payload.outputResultsDir,
        now,
      )
  }

  listRootsForConversation(conversationId: string): string[] {
    const rows = this.db
      .prepare(
        'SELECT sandbox_root FROM conversation_sandbox_runs WHERE conversation_id = ?',
      )
      .all(conversationId) as Array<{ sandbox_root: string }>
    return rows.map((r) => r.sandbox_root)
  }

  listForConversation(
    conversationId: string,
  ): StoredConversationSandboxRun[] {
    const rows = this.db
      .prepare(
        `SELECT sandbox_root, conversation_id, results_file_url, output_results_dir, created_at
         FROM conversation_sandbox_runs
         WHERE conversation_id = ?
         ORDER BY created_at ASC`,
      )
      .all(conversationId) as Array<{
      sandbox_root: string
      conversation_id: string
      results_file_url: string
      output_results_dir: string
      created_at: string
    }>

    return rows.map((r) => ({
      sandboxRoot: r.sandbox_root,
      conversationId: r.conversation_id,
      resultsFileUrl: r.results_file_url,
      outputResultsDir: r.output_results_dir,
      createdAt: r.created_at,
    }))
  }
}
