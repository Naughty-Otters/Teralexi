import type Database from 'better-sqlite3'

/**
 * Per-user enable/disable override for extensions discovered on disk
 * (`extensions-directory-loader.ts`). An extension with no row here is
 * enabled by default — same "absence means enabled" default skills use for
 * their file-based `enabled` frontmatter.
 */
export class ExtensionSettingsRepository {
  constructor(private readonly db: Database.Database) {}

  getEnabled(userId: string, extensionId: string): boolean {
    const row = this.db
      .prepare(
        'SELECT enabled FROM extension_settings WHERE user_id = ? AND extension_id = ?',
      )
      .get(userId, extensionId) as { enabled: number } | undefined

    return row === undefined || row.enabled !== 0
  }

  setEnabled(userId: string, extensionId: string, enabled: boolean): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO extension_settings (user_id, extension_id, enabled, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, extension_id)
         DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      )
      .run(userId, extensionId, enabled ? 1 : 0, now)
  }

  /** Returns extension ids explicitly disabled for this user. */
  listDisabledIds(userId: string): Set<string> {
    const rows = this.db
      .prepare(
        'SELECT extension_id FROM extension_settings WHERE user_id = ? AND enabled = 0',
      )
      .all(userId) as Array<{ extension_id: string }>
    return new Set(rows.map((row) => row.extension_id))
  }

  isEnabledInMap(disabledIds: Set<string>, extensionId: string): boolean {
    return !disabledIds.has(extensionId)
  }
}
