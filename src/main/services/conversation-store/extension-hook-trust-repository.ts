import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'

export type HookTrustStatus = 'pending' | 'trusted' | 'rejected'

export type HookTrustRecord = {
  trustKey: string
  contentHash: string
  status: HookTrustStatus
}

export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function computeHookTrustKey(
  extensionId: string,
  sourcePath: string,
  contentHash: string,
): string {
  return `ext:${extensionId}:${sourcePath}:${contentHash.slice(0, 16)}`
}

export class ExtensionHookTrustRepository {
  constructor(private readonly db: Database.Database) {}

  getStatus(userId: string, trustKey: string, contentHash: string): HookTrustStatus {
    const row = this.db
      .prepare(
        'SELECT status, content_hash FROM extension_hook_trust WHERE user_id = ? AND trust_key = ?',
      )
      .get(userId, trustKey) as { status: string; content_hash: string } | undefined

    if (!row) return 'pending'
    if (row.content_hash !== contentHash) return 'pending'
    if (row.status === 'trusted' || row.status === 'rejected') {
      return row.status
    }
    return 'pending'
  }

  setStatus(
    userId: string,
    trustKey: string,
    contentHash: string,
    status: HookTrustStatus,
  ): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO extension_hook_trust (user_id, trust_key, content_hash, status, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, trust_key)
         DO UPDATE SET content_hash = excluded.content_hash,
                       status = excluded.status,
                       updated_at = excluded.updated_at`,
      )
      .run(userId, trustKey, contentHash, status, now)
  }

  listPendingForUser(userId: string): Array<{
    trustKey: string
    contentHash: string
    status: HookTrustStatus
  }> {
    const rows = this.db
      .prepare(
        `SELECT trust_key, content_hash, status FROM extension_hook_trust
         WHERE user_id = ? AND status = 'pending'`,
      )
      .all(userId) as Array<{
      trust_key: string
      content_hash: string
      status: string
    }>

    return rows.map((row) => ({
      trustKey: row.trust_key,
      contentHash: row.content_hash,
      status: row.status as HookTrustStatus,
    }))
  }
}
