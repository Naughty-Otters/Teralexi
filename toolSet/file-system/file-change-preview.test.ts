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
  OTTER_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from '../sandbox-paths'
import { previewFileChange } from './file-change-preview'

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

describe('previewFileChange', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-preview-test-'))
    await writeFile(path.join(sandboxRoot, 'hello.txt'), 'hello world', 'utf-8')
    setSandboxRoot(sandboxRoot)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('previews edit_file without writing', async () => {
    const result = await previewFileChange('edit_file', {
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

  it('previews write_file overwrite', async () => {
    const result = await previewFileChange('write_file', {
      path: 'hello.txt',
      data: 'replacement',
      overwrite: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0]?.action).toBe('modify')
    expect(result.files[0]?.diff).toContain('+replacement')
  })

  it('previews apply_patch for new file', async () => {
    const result = await previewFileChange('apply_patch', {
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

    await expect(
      previewFileChange('write_file', {
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
      previewFileChange('write_file', {
        path: 'hello.txt',
        data: 'x',
        overwrite: false,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('already exists'),
    })
  })

  it('returns apply_patch validation errors', async () => {
    await expect(
      previewFileChange('apply_patch', { patch_text: '' }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Invalid patch_text'),
    })

    await expect(
      previewFileChange('apply_patch', {
        patch_text: `*** Begin Patch\n*** End Patch`,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('No files were modified'),
    })

    await expect(
      previewFileChange('apply_patch', {
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
      previewFileChange('edit_file', {
        path: 'hello.txt',
        old_string: 'a',
        new_string: 'b',
      }),
    ).resolves.toMatchObject({ ok: false })
    setSandboxRoot(sandboxRoot)
  })

  it('validates edit_file inputs and missing files', async () => {
    await expect(
      previewFileChange('edit_file', {
        path: '',
        old_string: 'a',
        new_string: 'b',
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('path') })

    await expect(
      previewFileChange('edit_file', {
        path: 'hello.txt',
        old_string: 'world',
        new_string: 'world',
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('identical') })

    await expect(
      previewFileChange('edit_file', {
        path: 'missing.txt',
        old_string: 'x',
        new_string: 'y',
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('not found') })

    await mkdir(path.join(sandboxRoot, 'subdir'))
    await expect(
      previewFileChange('edit_file', {
        path: 'subdir',
        old_string: 'x',
        new_string: 'y',
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('not a file') })
  })

  it('returns edit_file error when replacement cannot be applied', async () => {
    const result = await previewFileChange('edit_file', {
      path: 'hello.txt',
      old_string: 'missing-substring',
      new_string: 'replacement',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('previews edit_file create via empty old_string', async () => {
    const result = await previewFileChange('edit_file', {
      path: 'brand-new-edit.txt',
      old_string: '',
      new_string: 'created',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.files[0]?.action).toBe('create')
    }
  })

  it('previews apply_patch rename and write_file create', async () => {
    const renamePreview = await previewFileChange('apply_patch', {
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

    const writeCreate = await previewFileChange('write_file', {
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

  it('previews delete_file without deleting', async () => {
    const result = await previewFileChange('delete_file', { path: 'hello.txt' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0]?.action).toBe('delete')
    expect(result.files[0]?.deletions).toBeGreaterThan(0)
    expect(await readFileFs(path.join(sandboxRoot, 'hello.txt'), 'utf-8')).toBe(
      'hello world',
    )
  })

  it('previews move_file and copy_file', async () => {
    const move = await previewFileChange('move_file', {
      source: 'hello.txt',
      destination: 'moved.txt',
    })
    expect(move.ok).toBe(true)
    if (move.ok) {
      expect(move.files[0]?.action).toBe('rename')
      expect(move.files[0]?.moveFrom).toBe('hello.txt')
      expect(move.files[0]?.path).toBe('moved.txt')
    }

    const copy = await previewFileChange('copy_file', {
      source: 'hello.txt',
      destination: 'copy.txt',
    })
    expect(copy.ok).toBe(true)
    if (copy.ok) {
      expect(copy.files[0]?.action).toBe('create')
      expect(copy.files[0]?.path).toBe('copy.txt')
    }
  })
})
