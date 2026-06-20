import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OTTER_AGENT_SANDBOX_ROOT_ENV,
  OTTER_AGENT_WORKSPACE_PATH_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
} from '../sandbox-paths'
import { listFiles } from './list-files'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[OTTER_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[OTTER_AGENT_SANDBOX_ROOT_ENV]
  }
}

function setWorkspaceRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[WORKSPACE_PATH_GLOBAL_KEY] = root
    process.env[OTTER_AGENT_WORKSPACE_PATH_ENV] = root
  } else {
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
    delete process.env[OTTER_AGENT_WORKSPACE_PATH_ENV]
  }
}

describe('list-files tool', () => {
  let sandboxRoot: string
  let workspaceRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-list-sb-'))
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'openfde-list-ws-'))
    await mkdir(path.join(workspaceRoot, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(path.join(workspaceRoot, 'visible.ts'), 'x', 'utf-8')
    await writeFile(path.join(workspaceRoot, '.hidden.ts'), 'x', 'utf-8')
    await writeFile(
      path.join(workspaceRoot, 'node_modules', 'pkg', 'index.js'),
      'x',
      'utf-8',
    )
    setSandboxRoot(sandboxRoot)
    setWorkspaceRoot(workspaceRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    setWorkspaceRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('excludes package dirs and hidden files by default', async () => {
    const result = await listFiles.execute({ path: '.' })
    const names = (result.entries as Array<{ name: string }>).map((e) => e.name)
    expect(names).toContain('visible.ts')
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('.hidden.ts')
  })

  it('includes package dirs and hidden files when include_package_files is true', async () => {
    const result = await listFiles.execute({
      path: '.',
      include_package_files: true,
    })
    const names = (result.entries as Array<{ name: string }>).map((e) => e.name)
    expect(names).toContain('visible.ts')
    expect(names).toContain('node_modules')
    expect(names).toContain('.hidden.ts')
  })
})
