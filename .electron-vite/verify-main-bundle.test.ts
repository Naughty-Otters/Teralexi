import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findForbiddenSubstringsInMainJs,
  findUnbundledDynamicImportsInMainJs,
  isForbiddenRuntimeDynamicImport,
  scanSourceTextForForbiddenDynamicImports,
  scanSourcesForForbiddenDynamicImports,
  verifyMainBundle,
  verifyMainBundleContents,
} from './verify-main-bundle'

const MAIN_JS = join(process.cwd(), 'dist', 'electron', 'main', 'main.js')

/** Regression specs from packaged Electron failures (unbundled app modules). */
const REGRESSION_FORBIDDEN_SPECS = [
  '../hooks/user-hooks',
  '@main/agent/hooks/user-hooks',
  '../run/resolve-child-agent',
  '@main/workflows/workflow-compiler',
  '@main/workflows/workflow-executor',
  '@main/services/scheduler-manager',
  '@main/agent/llm/llm-debug-writer',
  '@main/agent/run/agent-run',
  './editor-lsp-bridge',
  '@main/agent/run/resolve-child-agent',
] as const

describe('isForbiddenRuntimeDynamicImport', () => {
  it('allows node builtins and declared external packages', () => {
    for (const spec of [
      'node:fs',
      'node:fs/promises',
      'node:crypto',
      'electron',
      'playwright-core',
      'cloakbrowser',
      'mmdb-lib',
    ]) {
      expect(isForbiddenRuntimeDynamicImport(spec)).toBe(false)
    }
  })

  it('forbids relative and alias imports into app source', () => {
    for (const spec of REGRESSION_FORBIDDEN_SPECS) {
      expect(isForbiddenRuntimeDynamicImport(spec)).toBe(true)
    }
  })

  it('allows the planned-todo-strategy cycle breaker', () => {
    expect(
      isForbiddenRuntimeDynamicImport(
        '../steps/foreach-item/strategies/planned-todo-strategy',
      ),
    ).toBe(false)
  })
})

describe('scanSourceTextForForbiddenDynamicImports', () => {
  it('flags await import of app modules', () => {
    expect(
      scanSourceTextForForbiddenDynamicImports(
        `export async function run() {
          const { runUserHooks } = await import('../hooks/user-hooks')
          return runUserHooks
        }`,
        'step-helpers.ts',
      ),
    ).toEqual(["step-helpers.ts: import('../hooks/user-hooks')"])
  })

  it('flags void import of app modules', () => {
    expect(
      scanSourceTextForForbiddenDynamicImports(
        `void import('@main/agent/llm/llm-debug-writer').then(({ invalidateLlmDebugCache }) => {
          invalidateLlmDebugCache('u1')
        })`,
        'ipc-main-handle.ts',
      ),
    ).toEqual([
      "ipc-main-handle.ts: import('@main/agent/llm/llm-debug-writer')",
    ])
  })

  it('ignores allowed externals and cycle-breaker imports', () => {
    const code = `
      await import('node:fs')
      await import('playwright-core')
      await import('../steps/foreach-item/strategies/planned-todo-strategy')
    `
    expect(scanSourceTextForForbiddenDynamicImports(code)).toEqual([])
  })

  it('does not flag type-only import() type syntax', () => {
    const code = `type X = import('../types').AgentResponseOpts`
    expect(scanSourceTextForForbiddenDynamicImports(code)).toEqual([])
  })
})

describe('verifyMainBundleContents', () => {
  it('rejects main.js that still references unbundled app paths', () => {
    const leaky = `
      const hooks = await import('../hooks/user-hooks')
      const wf = await import('@main/workflows/workflow-compiler')
    `
    expect(() => verifyMainBundleContents(leaky)).toThrow(
      /forbidden paths|unexpected filesystem dynamic imports/,
    )
  })

  it('accepts main.js with only allowed runtime dynamic imports', () => {
    const ok = `
      import('node:fs')
      import('node:crypto')
      import('playwright-core')
      import('cloakbrowser')
    `
    expect(() => verifyMainBundleContents(ok)).not.toThrow()
  })
})

describe('findForbiddenSubstringsInMainJs', () => {
  it('detects known bundle leak markers', () => {
    expect(
      findForbiddenSubstringsInMainJs(
        'failed to load ../hooks/user-hooks from app.asar',
      ),
    ).toContain('hooks/user-hooks')
    expect(
      findForbiddenSubstringsInMainJs(
        "import('@main/workflows/workflow-compiler')",
      ),
    ).toContain('@main/workflows/')
  })
})

describe('findUnbundledDynamicImportsInMainJs', () => {
  it('collects unresolved app-module dynamic import specs', () => {
    expect(
      findUnbundledDynamicImportsInMainJs(
        `import('../run/resolve-child-agent'); import('node:fs')`,
      ),
    ).toEqual(['../run/resolve-child-agent'])
  })

  it('ignores bundled CJS interop imports', () => {
    const bundledInterop = `
      import('.')
      import('./types')
      import('./get')
      import('cloakbrowser')
      import('node:fs')
    `
    expect(findUnbundledDynamicImportsInMainJs(bundledInterop)).toEqual([])
  })

  it('flags alias and parent-relative imports', () => {
    expect(
      findUnbundledDynamicImportsInMainJs(
        `import('@main/workflows/workflow-compiler'); import('../hooks/user-hooks')`,
      ),
    ).toEqual([
      '@main/workflows/workflow-compiler',
      '../hooks/user-hooks',
    ])
  })
})

describe('packaged main-process dynamic import guard', () => {
  it('has no forbidden dynamic imports in main-process sources', () => {
    expect(scanSourcesForForbiddenDynamicImports()).toEqual([])
  })

  it('covers regression paths in the live source tree', () => {
    const violations = scanSourcesForForbiddenDynamicImports()
    const joined = violations.join('\n')
    for (const spec of REGRESSION_FORBIDDEN_SPECS) {
      expect(joined).not.toContain(spec)
    }
  })

  it('passes on the built main bundle when dist/electron/main/main.js exists', () => {
    if (!existsSync(MAIN_JS)) {
      return
    }
    expect(() => verifyMainBundle()).not.toThrow()
  })

  it('built main.js has no string-literal app-module dynamic imports when present', () => {
    if (!existsSync(MAIN_JS)) {
      return
    }
    const code = readFileSync(MAIN_JS, 'utf8')
    expect(findUnbundledDynamicImportsInMainJs(code)).toEqual([])
    expect(findForbiddenSubstringsInMainJs(code)).toEqual([])
  })
})
