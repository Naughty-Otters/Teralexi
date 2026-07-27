import { describe, expect, it } from 'vitest'
import { runMigrations } from './migrations'
import { createMigrationTestDatabase } from './migration-test-db'
import { ExtensionHookTrustRepository } from './extension-hook-trust-repository'

describe('ExtensionHookTrustRepository', () => {
  it('defaults to pending for unknown keys', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new ExtensionHookTrustRepository(db)
    expect(repo.getStatus('default', 'key1', 'hash1')).toBe('pending')
  })

  it('stores and reads trusted status', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new ExtensionHookTrustRepository(db)
    repo.setStatus('default', 'key1', 'hash1', 'trusted')
    expect(repo.getStatus('default', 'key1', 'hash1')).toBe('trusted')
  })

  it('returns pending when content hash changes', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new ExtensionHookTrustRepository(db)
    repo.setStatus('default', 'key1', 'hash1', 'trusted')
    expect(repo.getStatus('default', 'key1', 'hash2')).toBe('pending')
  })
})
