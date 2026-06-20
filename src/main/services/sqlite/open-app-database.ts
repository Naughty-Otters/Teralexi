import Database from 'better-sqlite3'
import { ensureParentDirForFile } from '@config/openfde-home'

/**
 * Opens an app-owned SQLite database, creating parent directories first.
 * Use for all production better-sqlite3 opens (conversation store, vector memory, …).
 */
export function openAppSqliteDatabase(filePath: string): Database.Database {
  ensureParentDirForFile(filePath)
  const db = new Database(filePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
