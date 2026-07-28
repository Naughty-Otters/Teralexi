import { describe, expect, it } from 'vitest'
import { runMigrations } from './migrations'
import { createMigrationTestDatabase } from './migration-test-db'
import { ExtensionSettingsRepository } from './extension-settings-repository'

describe('ExtensionSettingsRepository', () => {
  it('defaults to enabled when no row exists', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new ExtensionSettingsRepository(db)

    expect(repo.getEnabled('default', 'secret-guard')).toBe(true)
  })

  it('persists a disabled override and reads it back', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new ExtensionSettingsRepository(db)

    repo.setEnabled('default', 'secret-guard', false)
    expect(repo.getEnabled('default', 'secret-guard')).toBe(false)

    repo.setEnabled('default', 'secret-guard', true)
    expect(repo.getEnabled('default', 'secret-guard')).toBe(true)
  })

  it('scopes overrides per user', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new ExtensionSettingsRepository(db)

    repo.setEnabled('userA', 'secret-guard', false)
    expect(repo.getEnabled('userA', 'secret-guard')).toBe(false)
    expect(repo.getEnabled('userB', 'secret-guard')).toBe(true)
  })

  it('upserts without throwing on repeated writes for the same key', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new ExtensionSettingsRepository(db)

    repo.setEnabled('default', 'secret-guard', false)
    repo.setEnabled('default', 'secret-guard', false)
    repo.setEnabled('default', 'secret-guard', true)
    expect(repo.getEnabled('default', 'secret-guard')).toBe(true)
  })

  it('lists disabled extension ids', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new ExtensionSettingsRepository(db)

    repo.setEnabled('default', 'secret-guard', false)
    repo.setEnabled('default', 'matrix-bridge', true)
    expect(repo.listDisabledIds('default')).toEqual(new Set(['secret-guard']))
  })
})
