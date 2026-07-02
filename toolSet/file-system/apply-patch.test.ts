import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OPENFDE_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from '../sandbox-paths'
import { applyPatch } from './apply-patch'

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

describe('apply-patch tool', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-apply-patch-'))
    await mkdir(path.join(sandboxRoot, 'dir'), { recursive: true })
    await writeFile(
      path.join(sandboxRoot, 'dir', 'sample.txt'),
      'before\n',
      'utf-8',
    )
    setSandboxRoot(sandboxRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('rejects invalid input and empty hunks', async () => {
    await expect(applyPatch.execute({ patch_text: '' })).resolves.toMatchObject(
      {
        error: expect.stringContaining('Invalid patch_text'),
      },
    )

    await expect(
      applyPatch.execute({
        patch_text: `*** Begin Patch\n*** End Patch`,
      }),
    ).resolves.toMatchObject({
      error: 'No files were modified.',
    })
  })

  it('returns sandbox error when inactive', async () => {
    setSandboxRoot(undefined)
    await expect(
      applyPatch.execute({
        patch_text: `*** Begin Patch\n*** Add File: x.txt\n+ok\n*** End Patch`,
      }),
    ).resolves.toMatchObject({ error: expect.stringContaining('sandbox') })
  })

  it('applies add/update/delete hunks', async () => {
    const result = (await applyPatch.execute({
      patch_text: `*** Begin Patch
*** Add File: created.txt
+hello
*** Update File: dir/sample.txt
@@
-before
+after
*** Delete File: created.txt
*** End Patch`,
    })) as {
      applied: boolean
      filesChanged: number
      summary: string
      diff: string
    }

    expect(result.applied).toBe(true)
    expect(result.filesChanged).toBe(3)
    expect(result.summary).toContain('M dir/sample.txt')
    expect(result.diff).toContain('+after')
    await expect(
      readFile(path.join(sandboxRoot, 'created.txt'), 'utf-8'),
    ).rejects.toThrow()
    await expect(
      readFile(path.join(sandboxRoot, 'dir', 'sample.txt'), 'utf-8'),
    ).resolves.toBe('after\n')
  })

  it('supports move updates', async () => {
    await writeFile(path.join(sandboxRoot, 'move-src.txt'), 'line\n', 'utf-8')

    const result = (await applyPatch.execute({
      patch_text: `*** Begin Patch
*** Update File: move-src.txt
*** Move to: moved/move-dest.txt
@@
-line
+line moved
*** End Patch`,
    })) as { applied: boolean; summary: string }

    expect(result.applied).toBe(true)
    expect(result.summary).toContain('M moved/move-dest.txt')
    await expect(
      readFile(path.join(sandboxRoot, 'move-src.txt'), 'utf-8'),
    ).rejects.toThrow()
    await expect(
      readFile(path.join(sandboxRoot, 'moved', 'move-dest.txt'), 'utf-8'),
    ).resolves.toBe('line moved\n')
  })

  it('rejects outside-sandbox paths', async () => {
    await expect(
      applyPatch.execute({
        patch_text: `*** Begin Patch
*** Add File: ../outside.txt
+blocked
*** End Patch`,
      }),
    ).resolves.toMatchObject({
      error: expect.stringMatching(/sandbox|workspace|escapes root/),
    })
  })

  it('rolls back already-applied changes on failure', async () => {
    const result = (await applyPatch.execute({
      patch_text: `*** Begin Patch
*** Add File: transient.txt
+temp
*** Update File: missing.txt
@@
-old
+new
*** End Patch`,
    })) as { error: string; rolledBack: boolean }

    expect(result.error).toContain('ENOENT')
    expect(result.rolledBack).toBe(true)
    await expect(
      readFile(path.join(sandboxRoot, 'transient.txt'), 'utf-8'),
    ).rejects.toThrow()
  })
})
