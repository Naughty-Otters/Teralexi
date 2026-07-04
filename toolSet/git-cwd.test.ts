import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeOtherRepo, fakeSandbox } from '@test-paths'
import {
  OPENFDE_AGENT_SANDBOX_ROOT_ENV,
  OPENFDE_AGENT_WORKSPACE_PATH_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
} from './sandbox-paths'
import { resolveActiveGitCwd, resolveGitWorkingDirectory } from './git-cwd'

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

function setWorkspaceRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[WORKSPACE_PATH_GLOBAL_KEY] = root
    process.env[OPENFDE_AGENT_WORKSPACE_PATH_ENV] = root
  } else {
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
    delete process.env[OPENFDE_AGENT_WORKSPACE_PATH_ENV]
  }
}

describe('resolveGitWorkingDirectory', () => {
  const SANDBOX = fakeSandbox()

  it('resolves relative paths inside base root', () => {
    const resolved = resolveGitWorkingDirectory(SANDBOX, 'repo')
    expect(resolved).toEqual({ ok: true, cwd: path.join(SANDBOX, 'repo') })
  })

  it('defaults to base root when workingDirectory is omitted', () => {
    expect(resolveGitWorkingDirectory(SANDBOX)).toEqual({
      ok: true,
      cwd: SANDBOX,
    })
  })

  it('rejects relative paths that escape base root', () => {
    const resolved = resolveGitWorkingDirectory(SANDBOX, '../../etc')
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) {
      expect(resolved.error).toMatch(/escapes root/i)
    }
  })

  it('allows absolute paths outside base root', () => {
    const otherRepo = fakeOtherRepo()
    const resolved = resolveGitWorkingDirectory(SANDBOX, otherRepo)
    expect(resolved).toEqual({ ok: true, cwd: otherRepo })
  })
})

describe('resolveActiveGitCwd', () => {
  let sandboxRoot: string
  let workspaceRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-git-cwd-sandbox-'))
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'openfde-git-cwd-workspace-'))
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    setWorkspaceRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('prefers workspace when no workingDirectory is given', () => {
    setSandboxRoot(sandboxRoot)
    setWorkspaceRoot(workspaceRoot)
    expect(resolveActiveGitCwd()).toEqual({ ok: true, cwd: workspaceRoot })
  })

  it('falls back to sandbox when workspace is unset', () => {
    setSandboxRoot(sandboxRoot)
    expect(resolveActiveGitCwd()).toEqual({ ok: true, cwd: sandboxRoot })
  })

  it('errors when neither sandbox nor workspace is set', () => {
    const resolved = resolveActiveGitCwd()
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) {
      expect(resolved.error).toMatch(/workspace folder or active sandbox/i)
    }
  })

  it('resolves explicit workingDirectory against sandbox when active', () => {
    setSandboxRoot(sandboxRoot)
    setWorkspaceRoot(workspaceRoot)
    const resolved = resolveActiveGitCwd('nested/repo')
    expect(resolved).toEqual({
      ok: true,
      cwd: path.join(sandboxRoot, 'nested/repo'),
    })
  })

  it('resolves explicit workingDirectory against workspace when sandbox is absent', () => {
    setWorkspaceRoot(workspaceRoot)
    const resolved = resolveActiveGitCwd('packages/app')
    expect(resolved).toEqual({
      ok: true,
      cwd: path.join(workspaceRoot, 'packages/app'),
    })
  })

  it('errors when workingDirectory is set but no base root exists', () => {
    const resolved = resolveActiveGitCwd('repo')
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) {
      expect(resolved.error).toMatch(/no active sandbox or workspace folder/i)
    }
  })
})
