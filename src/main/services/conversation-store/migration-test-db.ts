import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'

/**
 * In-memory SQLite for migration unit tests (system Node ABI).
 * Production still uses better-sqlite3 under Electron.
 */
export function createMigrationTestDatabase(): Database.Database {
  const db = new DatabaseSync(':memory:')
  const wrapped = {
    exec(sql: string) {
      db.exec(sql)
    },
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      return {
        run(...params: unknown[]) {
          stmt.run(...params)
        },
        get(...params: unknown[]) {
          return stmt.get(...params)
        },
        all(...params: unknown[]) {
          return stmt.all(...params)
        },
      }
    },
    pragma(source: string) {
      const match = source.match(/table_info\((\w+)\)/)
      if (match) {
        return db
          .prepare(`PRAGMA table_info(${match[1]})`)
          .all() as Array<{ name: string }>
      }
      return db.prepare(`PRAGMA ${source}`).all()
    },
  }
  return wrapped as unknown as Database.Database
}
