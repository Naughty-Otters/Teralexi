import { describe, expect, it } from 'vitest'
import { createMigrationTestDatabase } from './migration-test-db'

describe('createMigrationTestDatabase', () => {
  it('supports exec, prepare, and table_info pragma', () => {
    const db = createMigrationTestDatabase()
    db.exec('CREATE TABLE demo (id TEXT PRIMARY KEY, name TEXT NOT NULL)')
    db.prepare('INSERT INTO demo (id, name) VALUES (?, ?)').run('1', 'one')
    const row = db.prepare('SELECT name FROM demo WHERE id = ?').get('1') as {
      name: string
    }
    expect(row.name).toBe('one')
    const cols = db.pragma('table_info(demo)') as Array<{ name: string }>
    expect(cols.map((c) => c.name)).toContain('name')
  })

  it('supports generic pragma source', () => {
    const db = createMigrationTestDatabase()
    db.exec('CREATE TABLE t (x INTEGER)')
    const rows = db.pragma('foreign_keys') as Array<Record<string, unknown>>
    expect(Array.isArray(rows)).toBe(true)
  })
})
