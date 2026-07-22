import {
  mkdir,
  mkdtemp,
  readFile as readFileFs,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from '../sandbox-paths'
import { previewFileChange } from './file-change-preview'

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

describe('previewFileChange', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-preview-test-'))
    await writeFile(path.join(sandboxRoot, 'hello.txt'), 'hello world', 'utf-8')
    setSandboxRoot(sandboxRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('previews edit_files replace without writing', async () => {
    const result = await previewFileChange('edit_files', {
      mode: 'replace',
      path: 'hello.txt',
      old_string: 'world',
      new_string: 'otter',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.diff).toContain('-hello world')
    expect(result.files[0]?.diff).toContain('+hello otter')
    expect(await readFileFs(path.join(sandboxRoot, 'hello.txt'), 'utf-8')).toBe(
      'hello world',
    )
  })

  it('previews edit_files write overwrite', async () => {
    const result = await previewFileChange('edit_files', {
      mode: 'write',
      path: 'hello.txt',
      data: 'replacement',
      overwrite: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0]?.action).toBe('modify')
    expect(result.files[0]?.diff).toContain('+replacement')
  })

  it('previews edit_files patch for new file', async () => {
    const result = await previewFileChange('edit_files', {
      mode: 'patch',
      patch_text: `*** Begin Patch
*** Add File: new.txt
+line one
*** End Patch`,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0]?.path).toBe('new.txt')
    expect(result.files[0]?.action).toBe('create')
    await expect(
      readFileFs(path.join(sandboxRoot, 'new.txt'), 'utf-8'),
    ).rejects.toThrow()
  })

  it('returns errors for unsupported tools and invalid write preview settings', async () => {
    await expect(previewFileChange('unknown_tool', {})).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Unsupported tool'),
    })

    await expect(previewFileChange('move_file', {})).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Unsupported tool'),
    })

    await expect(
      previewFileChange('edit_files', {
        mode: 'write',
        path: 'hello.txt',
        data: 'x',
        overwrite: true,
        encoding: 'base64',
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('utf8'),
    })

    await expect(
      previewFileChange('edit_files', {
        mode: 'write',
        path: 'hello.txt',
        data: 'x',
        overwrite: false,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('already exists'),
    })
  })

  it('returns edit_files patch validation errors', async () => {
    await expect(
      previewFileChange('edit_files', { mode: 'patch', patch_text: '' }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Invalid patch_text'),
    })

    await expect(
      previewFileChange('edit_files', {
        mode: 'patch',
        patch_text: `*** Begin Patch\n*** End Patch`,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('No files were modified'),
    })

    await expect(
      previewFileChange('edit_files', {
        mode: 'patch',
        patch_text: `*** Begin Patch
*** Delete File: missing.txt
*** End Patch`,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('ENOENT'),
    })
  })

  it('returns errors when sandbox is inactive', async () => {
    setSandboxRoot(undefined)
    await expect(
      previewFileChange('edit_files', {
        mode: 'replace',
        path: 'hello.txt',
        old_string: 'a',
        new_string: 'b',
      }),
    ).resolves.toMatchObject({ ok: false })
    setSandboxRoot(sandboxRoot)
  })

  it('validates edit_files replace inputs and missing files', async () => {
    await expect(
      previewFileChange('edit_files', {
        mode: 'replace',
        path: '',
        old_string: 'a',
        new_string: 'b',
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('path') })

    await expect(
      previewFileChange('edit_files', {
        mode: 'replace',
        path: 'hello.txt',
        old_string: 'world',
        new_string: 'world',
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('identical') })

    await expect(
      previewFileChange('edit_files', {
        mode: 'replace',
        path: 'missing.txt',
        old_string: 'x',
        new_string: 'y',
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('not found') })

    await mkdir(path.join(sandboxRoot, 'subdir'))
    await expect(
      previewFileChange('edit_files', {
        mode: 'replace',
        path: 'subdir',
        old_string: 'x',
        new_string: 'y',
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('not a file') })
  })

  it('returns edit_files replace error when replacement cannot be applied', async () => {
    const result = await previewFileChange('edit_files', {
      mode: 'replace',
      path: 'hello.txt',
      old_string: 'missing-substring',
      new_string: 'replacement',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('previews edit_files create via empty old_string', async () => {
    const result = await previewFileChange('edit_files', {
      mode: 'replace',
      path: 'brand-new-edit.txt',
      old_string: '',
      new_string: 'created',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.files[0]?.action).toBe('create')
    }
  })

  it('previews edit_files patch rename and write create', async () => {
    const renamePreview = await previewFileChange('edit_files', {
      mode: 'patch',
      patch_text: `*** Begin Patch
*** Update File: hello.txt
*** Move to: renamed.txt
@@
-hello world
+hello otter
*** End Patch`,
    })
    expect(renamePreview.ok).toBe(true)
    if (renamePreview.ok) {
      expect(renamePreview.files[0]?.action).toBe('rename')
      expect(renamePreview.files[0]?.moveFrom).toBe('hello.txt')
    }

    const writeCreate = await previewFileChange('edit_files', {
      mode: 'write',
      path: 'brand-new.txt',
      data: 'new-content',
      overwrite: false,
    })
    expect(writeCreate.ok).toBe(true)
    if (writeCreate.ok) {
      expect(writeCreate.files[0]?.action).toBe('create')
      expect(writeCreate.files[0]?.path).toBe('brand-new.txt')
    }
  })

  it('previews edit_files delete without deleting', async () => {
    const result = await previewFileChange('edit_files', {
      mode: 'delete',
      path: 'hello.txt',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0]?.action).toBe('delete')
    expect(result.files[0]?.deletions).toBeGreaterThan(0)
    expect(await readFileFs(path.join(sandboxRoot, 'hello.txt'), 'utf-8')).toBe(
      'hello world',
    )
  })
})
