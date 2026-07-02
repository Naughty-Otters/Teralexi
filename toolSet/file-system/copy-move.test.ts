import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OPENFDE_AGENT_SANDBOX_ROOT_ENV,
  OPENFDE_AGENT_WORKSPACE_PATH_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
} from '../sandbox-paths'
import { copyFile, moveFile } from './copy-move'

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

describe('copy-move tools', () => {
  let sandboxRoot: string
  let workspaceRoot: string
  let externalRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-copy-move-sb-'))
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'openfde-copy-move-ws-'))
    externalRoot = await mkdtemp(path.join(tmpdir(), 'openfde-copy-move-ext-'))

    await writeFile(path.join(sandboxRoot, 'inside.txt'), 'inside', 'utf-8')
    await writeFile(path.join(workspaceRoot, 'project.txt'), 'project', 'utf-8')
    await writeFile(path.join(externalRoot, 'outside.txt'), 'outside', 'utf-8')
    setSandboxRoot(sandboxRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    setWorkspaceRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
    await rm(workspaceRoot, { recursive: true, force: true })
    await rm(externalRoot, { recursive: true, force: true })
  })

  it('returns null for non-string source/destination', async () => {
    await expect(
      copyFile.execute({ source: 1 as unknown as string, destination: 'x' }),
    ).resolves.toBeNull()
    await expect(
      moveFile.execute({ source: 'x', destination: 1 as unknown as string }),
    ).resolves.toBeNull()
  })

  it('returns file change rows for file move and copy', async () => {
    const moved = await moveFile.execute({
      source: 'inside.txt',
      destination: 'renamed.txt',
    })
    expect(moved).toMatchObject({
      moved: true,
      files: [expect.objectContaining({ action: 'rename', path: 'renamed.txt' })],
    })

    await writeFile(path.join(sandboxRoot, 'copy-src.txt'), 'copy-me', 'utf-8')
    const copied = await copyFile.execute({
      source: 'copy-src.txt',
      destination: 'copy-dst.txt',
    })
    expect(copied).toMatchObject({
      copied: true,
      files: [expect.objectContaining({ action: 'create', path: 'copy-dst.txt' })],
    })
  })

  it('copies from outside into sandbox and enforces overwrite checks', async () => {
    const source = path.join(externalRoot, 'outside.txt')

    const created = await copyFile.execute({
      source,
      destination: 'copied.txt',
    })
    expect(created).toMatchObject({ copied: true })
    await expect(
      readFile(path.join(sandboxRoot, 'copied.txt'), 'utf-8'),
    ).resolves.toBe('outside')

    const blocked = await copyFile.execute({
      source,
      destination: 'copied.txt',
    })
    expect(blocked).toMatchObject({
      error: expect.stringContaining('already exists'),
    })

    const overwritten = await copyFile.execute({
      source,
      destination: 'copied.txt',
      overwrite: true,
    })
    expect(overwritten).toMatchObject({ copied: true })
  })

  it('moves inside sandbox and blocks move to outside', async () => {
    const moved = await moveFile.execute({
      source: 'inside.txt',
      destination: 'nested/moved.txt',
    })
    expect(moved).toMatchObject({ moved: true })
    await expect(
      readFile(path.join(sandboxRoot, 'nested', 'moved.txt'), 'utf-8'),
    ).resolves.toBe('inside')

    const blocked = await moveFile.execute({
      source: 'nested/moved.txt',
      destination: '../outside.txt',
    })
    expect(blocked).toMatchObject({
      error: expect.stringMatching(/sandbox or user workspace|escapes root/),
    })
  })

  it('copies from workspace into sandbox', async () => {
    setWorkspaceRoot(workspaceRoot)
    const created = await copyFile.execute({
      source: 'project.txt',
      destination: path.join(sandboxRoot, 'from-workspace.txt'),
    })
    expect(created).toMatchObject({ copied: true })
    await expect(
      readFile(path.join(sandboxRoot, 'from-workspace.txt'), 'utf-8'),
    ).resolves.toBe('project')
  })

  it('returns sandbox error when inactive', async () => {
    setSandboxRoot(undefined)
    await expect(
      copyFile.execute({ source: 'a', destination: 'b' }),
    ).resolves.toMatchObject({
      error: expect.stringContaining('sandbox'),
    })
    await expect(
      moveFile.execute({ source: 'a', destination: 'b' }),
    ).resolves.toMatchObject({
      error: expect.stringContaining('sandbox'),
    })
  })
})
