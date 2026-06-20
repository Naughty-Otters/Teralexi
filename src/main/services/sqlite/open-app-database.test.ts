import { describe, expect, it, vi } from 'vitest'

const pragma = vi.fn()
const prepare = vi.fn(() => ({ get: vi.fn(() => ({ ok: 1 })) }))

vi.mock('better-sqlite3', () => ({
  default: class MockDatabase {
    pragma = pragma
    prepare = prepare
    close = vi.fn()
    constructor(public readonly path: string) {}
  },
}))

vi.mock('@config/openfde-home', () => ({
  ensureParentDirForFile: vi.fn(),
}))

import { ensureParentDirForFile } from '@config/openfde-home'
import { openAppSqliteDatabase } from './open-app-database'

describe('openAppSqliteDatabase', () => {
  it('ensures parent directories before opening sqlite', () => {
    const db = openAppSqliteDatabase('/mock/home/db/openfde.db')
    try {
      expect(ensureParentDirForFile).toHaveBeenCalledWith(
        '/mock/home/db/openfde.db',
      )
      expect(db.path).toBe('/mock/home/db/openfde.db')
      expect(pragma).toHaveBeenCalledWith('journal_mode = WAL')
      expect(pragma).toHaveBeenCalledWith('foreign_keys = ON')
    } finally {
      db.close()
    }
  })
})
