import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertMoveAllowed,
  getOutputResultsRelPrefix,
  getOutputScriptsRelPrefix,
  getSandboxOutputScopeFromEnv,
  getSandboxRootFromEnv,
  isPathInsideSandbox,
  OPENFDE_AGENT_SANDBOX_OUTPUT_SCOPE_ENV,
  OPENFDE_AGENT_SANDBOX_ROOT_ENV,
  remapLegacySharedOutputPath,
  requireActiveSandbox,
  resolvePathAllowingOutside,
  resolvePathMustBeInside,
  resolveScopedSandboxPath,
  resolveSandboxRelativePath,
  SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY,
  SANDBOX_ROOT_GLOBAL_KEY,
  sandboxPathError,
  setSandboxOutputScope,
  toolLoopOutputRelBase,
} from './sandbox-paths'

const SANDBOX = path.resolve('/tmp/otter-test-sandbox')

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[OPENFDE_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[OPENFDE_AGENT_SANDBOX_ROOT_ENV]
  }
}

function clearSandboxOutputScope() {
  setSandboxOutputScope(undefined)
}

describe('getSandboxRootFromEnv', () => {
  afterEach(() => setSandboxRoot(undefined))

  it('prefers globalThis over env', () => {
    process.env[OPENFDE_AGENT_SANDBOX_ROOT_ENV] = '/env/root'
    ;(globalThis as Record<string, unknown>)[SANDBOX_ROOT_GLOBAL_KEY] =
      '  /global/root  '
    expect(getSandboxRootFromEnv()).toBe('/global/root')
  })

  it('reads from env when global unset', () => {
    process.env[OPENFDE_AGENT_SANDBOX_ROOT_ENV] = ' /env/root '
    expect(getSandboxRootFromEnv()).toBe('/env/root')
  })

  it('returns undefined when unset', () => {
    expect(getSandboxRootFromEnv()).toBeUndefined()
  })
})

describe('requireActiveSandbox', () => {
  afterEach(() => setSandboxRoot(undefined))

  it('returns ok with root when configured', () => {
    setSandboxRoot(SANDBOX)
    expect(requireActiveSandbox()).toEqual({ ok: true, root: SANDBOX })
  })

  it('returns error when no sandbox', () => {
    const result = requireActiveSandbox()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('No active agent sandbox')
    }
  })
})

describe('isPathInsideSandbox', () => {
  it('accepts root and descendants', () => {
    expect(isPathInsideSandbox(SANDBOX, SANDBOX)).toBe(true)
    expect(isPathInsideSandbox(SANDBOX, path.join(SANDBOX, 'out', 'a.txt'))).toBe(
      true,
    )
  })

  it('rejects paths outside sandbox', () => {
    expect(isPathInsideSandbox(SANDBOX, '/etc/passwd')).toBe(false)
    expect(isPathInsideSandbox(SANDBOX, path.join(SANDBOX, '..', 'escape'))).toBe(
      false,
    )
  })
})

describe('resolveSandboxRelativePath', () => {
  it('resolves relative paths under sandbox', () => {
    expect(resolveSandboxRelativePath(SANDBOX, 'output/foo.txt')).toBe(
      path.join(SANDBOX, 'output', 'foo.txt'),
    )
  })

  it('strips leading slashes for sandbox-relative segments', () => {
    expect(resolveSandboxRelativePath(SANDBOX, '/output/foo')).toBe(
      path.join(SANDBOX, 'output', 'foo'),
    )
  })

  it('throws on empty or escape paths', () => {
    expect(() => resolveSandboxRelativePath(SANDBOX, '')).toThrow(/Empty path/)
    expect(() => resolveSandboxRelativePath(SANDBOX, '../etc/passwd')).toThrow(
      /escapes root/,
    )
    expect(resolveSandboxRelativePath(SANDBOX, '/')).toBe(SANDBOX)
  })
})

describe('resolvePathMustBeInside', () => {
  it('allows absolute paths already inside sandbox', () => {
    const inside = path.join(SANDBOX, 'file.txt')
    expect(resolvePathMustBeInside(SANDBOX, inside)).toBe(path.normalize(inside))
  })

  it('rejects absolute paths outside sandbox', () => {
    expect(() => resolvePathMustBeInside(SANDBOX, '/etc/hosts')).toThrow(
      /inside the sandbox/,
    )
  })
})

describe('resolvePathAllowingOutside', () => {
  it('allows host-absolute paths outside sandbox', () => {
    const host = '/var/tmp/host-file'
    expect(resolvePathAllowingOutside(SANDBOX, host)).toBe(path.normalize(host))
  })
})

describe('assertMoveAllowed', () => {
  it('allows move within sandbox', () => {
    const src = path.join(SANDBOX, 'a.txt')
    const dest = path.join(SANDBOX, 'b.txt')
    expect(() => assertMoveAllowed(SANDBOX, null, src, dest)).not.toThrow()
  })

  it('blocks destination outside sandbox', () => {
    expect(() =>
      assertMoveAllowed(SANDBOX, null, path.join(SANDBOX, 'a.txt'), '/tmp/out'),
    ).toThrow(/sandbox or user workspace/)
  })
})

describe('sandboxPathError', () => {
  it('formats Error and unknown values', () => {
    expect(sandboxPathError(new Error('bad path'))).toEqual({
      error: 'bad path',
    })
    expect(sandboxPathError('oops')).toEqual({ error: 'oops' })
  })
})

describe('tool-loop output scope', () => {
  afterEach(() => clearSandboxOutputScope())

  it('uses shared output dirs when scope unset', () => {
    expect(getOutputResultsRelPrefix()).toBe(
      path.join('output', 'results'),
    )
    expect(getOutputScriptsRelPrefix()).toBe(
      path.join('output', 'scripts'),
    )
  })

  it('uses per-step dirs when scope is set', () => {
    setSandboxOutputScope('step-abc')
    expect(toolLoopOutputRelBase('step-abc')).toBe(
      path.join('output', 'toolLoop', 'step-abc'),
    )
    expect(getOutputResultsRelPrefix()).toBe(
      path.join('output', 'toolLoop', 'step-abc', 'results'),
    )
    expect(getOutputScriptsRelPrefix()).toBe(
      path.join('output', 'toolLoop', 'step-abc', 'scripts'),
    )
    expect(getSandboxOutputScopeFromEnv()).toBe('step-abc')
    expect(process.env[OPENFDE_AGENT_SANDBOX_OUTPUT_SCOPE_ENV]).toBe('step-abc')
    expect(
      (globalThis as Record<string, unknown>)[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY],
    ).toBe('step-abc')
  })

  it('remaps legacy output/results paths to scoped dir', () => {
    setSandboxOutputScope('todo-1')
    expect(remapLegacySharedOutputPath('output/results/quotes.json')).toBe(
      path.join('output', 'toolLoop', 'todo-1', 'results', 'quotes.json'),
    )
    expect(remapLegacySharedOutputPath('output/scripts/run.py')).toBe(
      path.join('output', 'toolLoop', 'todo-1', 'scripts', 'run.py'),
    )
  })

  it('resolveScopedSandboxPath leaves refs/ outside toolLoop scope', () => {
    setSandboxOutputScope('step-x')
    expect(resolveScopedSandboxPath(SANDBOX, 'refs/plan.md')).toBe(
      path.join(SANDBOX, 'refs', 'plan.md'),
    )
    expect(resolveScopedSandboxPath(SANDBOX, 'output/results/a.txt')).toBe(
      path.join(SANDBOX, 'output', 'toolLoop', 'step-x', 'results', 'a.txt'),
    )
  })
})
