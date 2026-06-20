import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OTTER_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from '../sandbox-paths'
import { editFile } from './edit-file'

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

describe('edit-file tool', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-edit-file-'))
    await writeFile(
      path.join(sandboxRoot, 'hello.txt'),
      'hello world\n',
      'utf-8',
    )
    await writeFile(
      path.join(sandboxRoot, 'crlf.txt'),
      'line1\r\nline2\r\n',
      'utf-8',
    )
    await mkdir(path.join(sandboxRoot, 'dir-only'), { recursive: true })
    setSandboxRoot(sandboxRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('rejects invalid inputs and inactive sandbox', async () => {
    setSandboxRoot(undefined)
    await expect(
      editFile.execute({ path: 'hello.txt', old_string: 'a', new_string: 'b' }),
    ).resolves.toMatchObject({ error: expect.stringContaining('sandbox') })

    setSandboxRoot(sandboxRoot)
    await expect(
      editFile.execute({ path: '', old_string: 'a', new_string: 'b' }),
    ).resolves.toMatchObject({
      error: expect.stringContaining('Invalid path'),
    })
    await expect(
      editFile.execute({ path: 'hello.txt', old_string: 'a', new_string: 'a' }),
    ).resolves.toMatchObject({
      error: expect.stringContaining('identical'),
    })
  })

  it('creates or overwrites when old_string is empty', async () => {
    const created = await editFile.execute({
      path: 'new-file.txt',
      old_string: '',
      new_string: 'created',
    })
    expect(created).toMatchObject({ written: true })
    await expect(
      readFile(path.join(sandboxRoot, 'new-file.txt'), 'utf-8'),
    ).resolves.toBe('created')

    const overwritten = await editFile.execute({
      path: 'hello.txt',
      old_string: '',
      new_string: 'overwritten',
    })
    expect(overwritten).toMatchObject({ written: true })
    await expect(
      readFile(path.join(sandboxRoot, 'hello.txt'), 'utf-8'),
    ).resolves.toBe('overwritten')
  })

  it('edits existing files and preserves line endings', async () => {
    const result = (await editFile.execute({
      path: 'crlf.txt',
      old_string: 'line1\nline2',
      new_string: 'line1\nline2-updated',
    })) as { written: boolean }

    expect(result.written).toBe(true)
    await expect(
      readFile(path.join(sandboxRoot, 'crlf.txt'), 'utf-8'),
    ).resolves.toBe('line1\r\nline2-updated\r\n')
  })

  it('returns explicit errors for missing file, non-file path, and unmatched search', async () => {
    await expect(
      editFile.execute({
        path: 'missing.txt',
        old_string: 'a',
        new_string: 'b',
      }),
    ).resolves.toMatchObject({
      error: expect.stringContaining('File not found'),
    })

    await expect(
      editFile.execute({ path: 'dir-only', old_string: 'a', new_string: 'b' }),
    ).resolves.toMatchObject({ error: expect.stringContaining('not a file') })

    const unmatched = (await editFile.execute({
      path: 'hello.txt',
      old_string: 'missing-content',
      new_string: 'x',
    })) as { error: string; path: string }

    expect(unmatched.error).toContain('Could not find oldString')
    expect(unmatched.path.endsWith('hello.txt')).toBe(true)
  })
})
