import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLANNED_TODO_STRATEGY_BUNDLE_MARKER } from '../src/main/agent/coding/plan-mode-todo-bundle-marker'
import {
  findForbiddenSubstringsInMainJs,
  findMissingRequiredSubstringsInMainJs,
  findUnbundledDynamicImportsInMainJs,
  isForbiddenRuntimeDynamicImport,
  scanSourceTextForForbiddenDynamicImports,
  scanSourcesForForbiddenDynamicImports,
  verifyBootstrapBundleContents,
  verifyMainAppSourceWiring,
  verifyMainBundle,
  verifyMainBundleContents,
} from './verify-main-bundle'

const MAIN_DIR = join(process.cwd(), 'dist', 'electron', 'main')
const BOOTSTRAP_JS = join(MAIN_DIR, 'bootstrap.js')
const MAIN_APP_JS = join(MAIN_DIR, 'main-app.js')

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
  '../steps/foreach-item/strategies/planned-todo-strategy',
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

  it('allows bootstrap to import main-app dynamically', () => {
    expect(
      scanSourceTextForForbiddenDynamicImports(
        `await import('./main-app.js')`,
        'src/main/bootstrap.ts',
      ),
    ).toEqual([])
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

  it('ignores allowed externals', () => {
    const code = `
      await import('node:fs')
      await import('playwright-core')
    `
    expect(scanSourceTextForForbiddenDynamicImports(code)).toEqual([])
  })

  it('forbids planned-todo-strategy dynamic import (asar packaging regression)', () => {
    expect(
      scanSourceTextForForbiddenDynamicImports(
        `await import('../steps/foreach-item/strategies/planned-todo-strategy')`,
        'plan-mode-execution-bridge.ts',
      ),
    ).toEqual([
      "plan-mode-execution-bridge.ts: import('../steps/foreach-item/strategies/planned-todo-strategy')",
    ])
  })

  it('does not flag type-only import() type syntax', () => {
    const code = `type X = import('../types').AgentResponseOpts`
    expect(scanSourceTextForForbiddenDynamicImports(code)).toEqual([])
  })
})

describe('verifyMainBundleContents', () => {
  it('rejects main-app.js that still references unbundled app paths', () => {
    const leaky = `
      const hooks = await import('../hooks/user-hooks')
      const wf = await import('@main/workflows/workflow-compiler')
      ${JSON.stringify(PLANNED_TODO_STRATEGY_BUNDLE_MARKER)}
    `
    expect(() => verifyMainBundleContents(leaky)).toThrow(
      /forbidden paths|unexpected filesystem dynamic imports/,
    )
  })

  it('rejects main-app.js missing the planned-todo packaging marker', () => {
    const okImports = `
      import('node:fs')
      import('playwright-core')
    `
    expect(() => verifyMainBundleContents(okImports)).toThrow(
      /missing required packaged markers/,
    )
  })

  it('accepts main-app.js with only allowed runtime dynamic imports and required markers', () => {
    const ok = `
      import('node:fs')
      import('node:crypto')
      import('playwright-core')
      import('cloakbrowser')
      ${JSON.stringify(PLANNED_TODO_STRATEGY_BUNDLE_MARKER)}
    `
    expect(() => verifyMainBundleContents(ok)).not.toThrow()
  })
})

describe('verifyMainAppSourceWiring', () => {
  it('requires the planned-todo strategy side-effect import in main-app.ts', () => {
    expect(() =>
      verifyMainAppSourceWiring(`import './something-else'\n`),
    ).toThrow(/must statically import/)
    expect(() =>
      verifyMainAppSourceWiring(
        `import './agent/steps/foreach-item/strategies/planned-todo-strategy'\n`,
      ),
    ).not.toThrow()
  })

  it('passes on the live main-app.ts source', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'main', 'main-app.ts'),
      'utf8',
    )
    expect(() => verifyMainAppSourceWiring(source)).not.toThrow()
  })
})

describe('findMissingRequiredSubstringsInMainJs', () => {
  it('reports when the planned-todo marker is absent', () => {
    expect(findMissingRequiredSubstringsInMainJs('nope')).toEqual([
      PLANNED_TODO_STRATEGY_BUNDLE_MARKER,
    ])
    expect(
      findMissingRequiredSubstringsInMainJs(PLANNED_TODO_STRATEGY_BUNDLE_MARKER),
    ).toEqual([])
  })
})

describe('verifyBootstrapBundleContents', () => {
  it('allows bootstrap to dynamically import main-app.js', () => {
    const ok = `
      import('./main-app.js')
      import('electron')
    `
    expect(() => verifyBootstrapBundleContents(ok)).not.toThrow()
  })

  it('rejects bootstrap.js that imports other app modules', () => {
    const leaky = `import('../hooks/user-hooks')`
    expect(() => verifyBootstrapBundleContents(leaky)).toThrow(
      /forbidden paths|unexpected filesystem dynamic imports/,
    )
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

  it('passes on the built main bundles when dist output exists', () => {
    if (!existsSync(BOOTSTRAP_JS) || !existsSync(MAIN_APP_JS)) {
      return
    }
    expect(() => verifyMainBundle()).not.toThrow()
  })

  it('built main-app.js has no string-literal app-module dynamic imports when present', () => {
    if (!existsSync(MAIN_APP_JS)) {
      return
    }
    const code = readFileSync(MAIN_APP_JS, 'utf8')
    expect(findUnbundledDynamicImportsInMainJs(code)).toEqual([])
    expect(findForbiddenSubstringsInMainJs(code)).toEqual([])
    expect(findMissingRequiredSubstringsInMainJs(code)).toEqual([])
  })

  it('built bootstrap.js only imports main-app.js when present', () => {
    if (!existsSync(BOOTSTRAP_JS)) {
      return
    }
    const code = readFileSync(BOOTSTRAP_JS, 'utf8')
    const bad = findUnbundledDynamicImportsInMainJs(code).filter(
      (spec) => spec !== './main-app.js' && spec !== './main-app',
    )
    expect(bad).toEqual([])
    expect(findForbiddenSubstringsInMainJs(code)).toEqual([])
  })
})
