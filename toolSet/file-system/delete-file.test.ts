import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from '../sandbox-paths'
import { deleteFile } from './delete-file'

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

describe('delete-file tool', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-delete-file-'))
    await writeFile(path.join(sandboxRoot, 'remove-me.txt'), 'goodbye\n', 'utf-8')
    setSandboxRoot(sandboxRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('rejects invalid path and inactive sandbox', async () => {
    setSandboxRoot(undefined)
    await expect(deleteFile.execute({ path: 'remove-me.txt' })).resolves.toMatchObject({
      error: expect.stringContaining('sandbox'),
    })

    setSandboxRoot(sandboxRoot)
    await expect(deleteFile.execute({ path: '' })).resolves.toMatchObject({
      error: expect.stringContaining('Invalid path'),
    })
  })

  it('deletes a file and returns file change preview', async () => {
    const result = await deleteFile.execute({ path: 'remove-me.txt' })
    expect(result).toMatchObject({
      deleted: true,
      files: expect.arrayContaining([
        expect.objectContaining({
          action: 'delete',
          path: 'remove-me.txt',
          deletions: expect.any(Number),
        }),
      ]),
    })

    await expect(access(path.join(sandboxRoot, 'remove-me.txt'))).rejects.toThrow()
  })

  it('rejects directories', async () => {
    await mkdir(path.join(sandboxRoot, 'dir-only'), { recursive: true })
    await expect(deleteFile.execute({ path: 'dir-only' })).resolves.toMatchObject({
      error: expect.stringContaining('not a file'),
    })
  })
})
