import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  RUNTIME_PACKAGE_REMOVALS,
  RUNTIME_SCOPE_PREFIX_REMOVALS,
  shouldRemovePackage,
  shouldRemoveShippedSourceTestFile,
  pruneShippedSourceTests,
} from '../scripts/electron-after-pack.cjs'

describe('electron-after-pack', () => {
  it('flags renderer-only packages for removal', () => {
    expect(shouldRemovePackage('monaco-editor')).toBe(true)
    expect(shouldRemovePackage('mermaid')).toBe(true)
    expect(shouldRemovePackage('eslint')).toBe(true)
    expect(shouldRemovePackage('@nuxt/ui')).toBe(true)
    expect(shouldRemovePackage('@workflow/core')).toBe(true)
    expect(shouldRemovePackage('@vue/compiler-dom')).toBe(true)
    expect(shouldRemovePackage('@eslint/js')).toBe(true)
    expect(RUNTIME_PACKAGE_REMOVALS.has('workflow')).toBe(true)
    expect(
      RUNTIME_SCOPE_PREFIX_REMOVALS.some((prefix) =>
        '@vue/compiler-dom'.startsWith(prefix),
      ),
    ).toBe(true)
  })

  it('keeps main-process runtime packages', () => {
    expect(shouldRemovePackage('better-sqlite3')).toBe(false)
    expect(shouldRemovePackage('playwright-core')).toBe(false)
    expect(shouldRemovePackage('pyright')).toBe(false)
    expect(shouldRemovePackage('typescript-language-server')).toBe(false)
    expect(shouldRemovePackage('@ai-sdk/openai')).toBe(false)
  })

  it('flags shipped source test files for removal', () => {
    expect(shouldRemoveShippedSourceTestFile('index.test.ts')).toBe(true)
    expect(shouldRemoveShippedSourceTestFile('foo.integration.test.ts')).toBe(
      true,
    )
    expect(shouldRemoveShippedSourceTestFile('vitest.setup.ts')).toBe(true)
    expect(shouldRemoveShippedSourceTestFile('index.ts')).toBe(false)
    expect(shouldRemoveShippedSourceTestFile('run-search.ts')).toBe(false)
  })

  it('prunes shipped source test files and directories', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'teralexi-after-pack-'))
    const distMain = join(appDir, 'dist', 'electron', 'main')
    mkdirSync(distMain, { recursive: true })
    writeFileSync(join(distMain, 'main.js'), 'export {}')
    writeFileSync(join(distMain, 'main.test.ts'), 'test')
    mkdirSync(join(appDir, 'config', '__tests__'), { recursive: true })
    writeFileSync(join(appDir, 'config', '__tests__', 'case.ts'), 'test')

    const stats = pruneShippedSourceTests(appDir)
    expect(stats.sourceTestFiles).toBe(1)
    expect(stats.sourceTestDirs).toBe(1)
    expect(existsSync(join(distMain, 'main.js'))).toBe(true)
    expect(existsSync(join(distMain, 'main.test.ts'))).toBe(false)
    expect(readdirSync(join(appDir, 'config'))).toEqual([])
  })

  it('removes legacy shipped src trees', () => {
    const { pruneShippedSourceTrees } = require('../scripts/electron-after-pack.cjs')
    const appDir = mkdtempSync(join(tmpdir(), 'teralexi-after-pack-src-'))
    mkdirSync(join(appDir, 'src', 'main'), { recursive: true })
    writeFileSync(join(appDir, 'src', 'main', 'index.ts'), 'export {}')

    expect(pruneShippedSourceTrees(appDir)).toBe(1)
    expect(existsSync(join(appDir, 'src'))).toBe(false)
  })
})
