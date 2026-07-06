import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  TERALEXI_AGENT_WORKSPACE_PATH_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
} from '@toolSet/sandbox-paths'
import { evaluateFileToolPermission } from '@main/agent/permissions/tool-permission-gate'

vi.mock('../workspace/conversation-workspace', () => ({
  getWorkspacePath: vi.fn(() => null),
}))

import { getWorkspacePath } from '../workspace/conversation-workspace'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV]
  }
}

function setWorkspaceRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[WORKSPACE_PATH_GLOBAL_KEY] = root
    process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV] = root
  } else {
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_WORKSPACE_PATH_ENV]
  }
}

describe('tool-permission-gate', () => {
  let sandboxRoot: string
  let workspaceRoot: string

  beforeEach(async () => {
    vi.mocked(getWorkspacePath).mockReturnValue(null)
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-perm-test-'))
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-perm-ws-'))
    await writeFile(path.join(workspaceRoot, 'project.txt'), 'ok', 'utf-8')
    setSandboxRoot(sandboxRoot)
    setWorkspaceRoot(undefined)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    setWorkspaceRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('allows read_file inside sandbox', () => {
    const decision = evaluateFileToolPermission('read_file', { path: 'hello.txt' })
    expect(decision.action).toBe('allow')
    expect(decision.permissionKey).toBe('read')
  })

  it('denies paths outside sandbox when no workspace is set', () => {
    const decision = evaluateFileToolPermission('read_file', { path: '/etc/passwd' })
    expect(decision.action).toBe('deny')
    expect(decision.permissionKey).toBe('external_path')
  })

  it('allows absolute paths inside the bound workspace', () => {
    setWorkspaceRoot(workspaceRoot)
    const abs = path.join(workspaceRoot, 'project.txt')
    const decision = evaluateFileToolPermission('read_file', { path: abs })
    expect(decision.action).toBe('allow')
    expect(decision.permissionKey).toBe('read')
  })

  it('allows nested workspace file paths (blender-mcp style)', async () => {
    setWorkspaceRoot(workspaceRoot)
    const abs = path.join(
      workspaceRoot,
      'src',
      'blender_mcp',
      'server.py',
    )
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, 'print("ok")\n', 'utf-8')
    const decision = evaluateFileToolPermission('read_file', { path: abs })
    expect(decision.action).toBe('allow')
  })

  it('allows workspace paths from conversation settings when env is unset', () => {
    vi.mocked(getWorkspacePath).mockReturnValue(workspaceRoot)
    const abs = path.join(workspaceRoot, 'project.txt')
    const decision = evaluateFileToolPermission(
      'read_file',
      { path: abs },
      'conv-1',
    )
    expect(decision.action).toBe('allow')
    expect(getWorkspacePath).toHaveBeenCalledWith('conv-1')
  })

  it('maps edit_file to edit permission with ask default', () => {
    const decision = evaluateFileToolPermission('edit_file', {
      path: 'foo.ts',
      old_string: 'a',
      new_string: 'b',
    })
    expect(decision.permissionKey).toBe('edit')
    expect(decision.action).toBe('ask')
  })
})
