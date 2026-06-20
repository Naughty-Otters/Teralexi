import type Database from 'better-sqlite3'
import type { StoredUserProperty } from './types'

export class UserPropertiesRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly defaultWorkspacePath: string,
  ) {}

  ensureDefaults(userId: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT OR IGNORE INTO user_properties (user_id, property_key, property_value, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(userId, 'user.workspace', this.defaultWorkspacePath, now)
  }

  getWorkspacePath(userId: string): string {
    const workspaceProp = this.get(userId, 'user.workspace')
    const workspacePath = workspaceProp?.propertyValue?.trim()
    return workspacePath || this.defaultWorkspacePath
  }

  list(userId: string): StoredUserProperty[] {
    this.ensureDefaults(userId)

    const rows = this.db
      .prepare(
        'SELECT user_id, property_key, property_value, updated_at FROM user_properties WHERE user_id = ? ORDER BY property_key ASC',
      )
      .all(userId) as Array<{
      user_id: string
      property_key: string
      property_value: string
      updated_at: string
    }>

    return rows.map((r) => ({
      userId: r.user_id,
      propertyKey: r.property_key,
      propertyValue: r.property_value,
      updatedAt: r.updated_at,
    }))
  }

  getAllAsMap(userId: string): Record<string, string> {
    this.ensureDefaults(userId)

    const rows = this.db
      .prepare(
        'SELECT property_key, property_value FROM user_properties WHERE user_id = ? ORDER BY property_key ASC',
      )
      .all(userId) as Array<{
      property_key: string
      property_value: string
    }>

    const mapping: Record<string, string> = {}
    for (const row of rows) {
      mapping[row.property_key] = row.property_value
    }
    return mapping
  }

  get(userId: string, propertyKey: string): StoredUserProperty | null {
    this.ensureDefaults(userId)

    const row = this.db
      .prepare(
        'SELECT user_id, property_key, property_value, updated_at FROM user_properties WHERE user_id = ? AND property_key = ?',
      )
      .get(userId, propertyKey) as
      | {
          user_id: string
          property_key: string
          property_value: string
          updated_at: string
        }
      | undefined

    if (!row) return null
    return {
      userId: row.user_id,
      propertyKey: row.property_key,
      propertyValue: row.property_value,
      updatedAt: row.updated_at,
    }
  }

  set(userId: string, propertyKey: string, propertyValue: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO user_properties (user_id, property_key, property_value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, property_key)
         DO UPDATE SET property_value = excluded.property_value, updated_at = excluded.updated_at`,
      )
      .run(userId, propertyKey, propertyValue, now)
  }

  delete(userId: string, propertyKey: string): void {
    this.db
      .prepare(
        'DELETE FROM user_properties WHERE user_id = ? AND property_key = ?',
      )
      .run(userId, propertyKey)
  }

  clear(userId: string): void {
    this.db.prepare('DELETE FROM user_properties WHERE user_id = ?').run(userId)
  }
}
