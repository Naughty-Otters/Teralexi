import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let projectRoot = ''

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/packaged/app' },
}))

describe('bundled-default-rules', () => {
  let cwdSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'teralexi-bundled-rules-'))
    mkdirSync(join(projectRoot, '.teralexi', 'rules'), { recursive: true })
    writeFileSync(
      join(projectRoot, '.teralexi', 'rules', 'coding-standards.md'),
      '# Coding standards',
    )
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(projectRoot)
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    vi.resetModules()
  })

  it('resolveBundledDefaultRulesDirectory points at repo .teralexi/rules in dev', async () => {
    const { resolveBundledDefaultRulesDirectory } = await import('./bundled-default-rules')
    expect(resolveBundledDefaultRulesDirectory()).toBe(
      join(projectRoot, '.teralexi', 'rules'),
    )
  })

  it('seedBundledDefaultRulesIfMissing copies missing rule files only', async () => {
    const userRulesDir = mkdtempSync(join(tmpdir(), 'teralexi-user-rules-'))
    writeFileSync(join(userRulesDir, 'existing.md'), '# Existing')

    const { seedBundledDefaultRulesIfMissing } = await import('./bundled-default-rules')
    seedBundledDefaultRulesIfMissing(userRulesDir)

    expect(readFileSync(join(userRulesDir, 'existing.md'), 'utf-8')).toBe('# Existing')
    expect(existsSync(join(userRulesDir, 'coding-standards.md'))).toBe(true)
    expect(readFileSync(join(userRulesDir, 'coding-standards.md'), 'utf-8')).toBe(
      '# Coding standards',
    )

    writeFileSync(
      join(projectRoot, '.teralexi', 'rules', 'coding-standards.md'),
      '# Updated bundled',
    )
    seedBundledDefaultRulesIfMissing(userRulesDir)
    expect(readFileSync(join(userRulesDir, 'coding-standards.md'), 'utf-8')).toBe(
      '# Coding standards',
    )
  })

  it('seedBundledDefaultRulesIfMissing is a no-op when bundled rules are absent', async () => {
    const userRulesDir = mkdtempSync(join(tmpdir(), 'teralexi-user-rules-empty-'))
    const emptyRoot = mkdtempSync(join(tmpdir(), 'teralexi-no-bundled-rules-'))
    cwdSpy.mockReturnValue(emptyRoot)

    const { seedBundledDefaultRulesIfMissing } = await import('./bundled-default-rules')
    expect(() => seedBundledDefaultRulesIfMissing(userRulesDir)).not.toThrow()
    expect(existsSync(join(userRulesDir, 'coding-standards.md'))).toBe(false)
  })
})

describe('verifyBundledTeralexiRules', () => {
  let cwdSpy: ReturnType<typeof vi.spyOn> | undefined

  afterEach(() => {
    cwdSpy?.mockRestore()
    vi.resetModules()
  })

  it('passes when .teralexi/rules contains markdown rules', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teralexi-verify-rules-'))
    mkdirSync(join(root, '.teralexi', 'rules'), { recursive: true })
    writeFileSync(join(root, '.teralexi', 'rules', 'coding-standards.md'), '# rules')
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root)

    const { verifyBundledTeralexiRules } = await import(
      '../../../.electron-vite/verify-bundled-teralexi-rules'
    )
    expect(() => verifyBundledTeralexiRules()).not.toThrow()
  })

  it('throws when bundled rules directory is missing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'teralexi-verify-rules-missing-'))
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root)

    const { verifyBundledTeralexiRules } = await import(
      '../../../.electron-vite/verify-bundled-teralexi-rules'
    )
    expect(() => verifyBundledTeralexiRules()).toThrow(
      'missing bundled default rules directory',
    )
  })
})
