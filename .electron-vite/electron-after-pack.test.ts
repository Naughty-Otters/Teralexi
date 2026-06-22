import { describe, expect, it } from 'vitest'
import {
  RUNTIME_PACKAGE_REMOVALS,
  RUNTIME_SCOPE_PREFIX_REMOVALS,
  shouldRemovePackage,
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
})
