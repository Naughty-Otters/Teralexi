import { describe, expect, it, vi, beforeEach } from 'vitest'
import { editFiles } from './edit-files'
import { editFile } from './edit-file'
import { writeFile } from './write-file'
import { deleteFile } from './delete-file'
import { applyPatch } from './apply-patch'

vi.mock('./edit-file', () => ({
  editFile: { name: 'edit_file', execute: vi.fn() },
}))
vi.mock('./write-file', () => ({
  writeFile: { name: 'write_file', execute: vi.fn() },
}))
vi.mock('./delete-file', () => ({
  deleteFile: { name: 'delete_file', execute: vi.fn() },
}))
vi.mock('./apply-patch', () => ({
  applyPatch: { name: 'apply_patch', execute: vi.fn() },
}))

describe('edit_files', () => {
  beforeEach(() => {
    vi.mocked(editFile.execute).mockReset()
    vi.mocked(writeFile.execute).mockReset()
    vi.mocked(deleteFile.execute).mockReset()
    vi.mocked(applyPatch.execute).mockReset()
  })

  it('dispatches replace to edit_file', async () => {
    vi.mocked(editFile.execute).mockResolvedValue({ written: true })
    await editFiles.execute({
      mode: 'replace',
      path: 'src/a.ts',
      old_string: 'a',
      new_string: 'b',
    })
    expect(editFile.execute).toHaveBeenCalledWith({
      path: 'src/a.ts',
      old_string: 'a',
      new_string: 'b',
      replace_all: false,
    })
  })

  it('dispatches write to write_file', async () => {
    vi.mocked(writeFile.execute).mockResolvedValue({ written: true })
    await editFiles.execute({
      mode: 'write',
      path: 'src/a.ts',
      data: 'hello',
      overwrite: true,
    })
    expect(writeFile.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'src/a.ts',
        data: 'hello',
        overwrite: true,
      }),
    )
  })

  it('dispatches delete to delete_file', async () => {
    vi.mocked(deleteFile.execute).mockResolvedValue({ deleted: true })
    await editFiles.execute({ mode: 'delete', path: 'src/a.ts' })
    expect(deleteFile.execute).toHaveBeenCalledWith({ path: 'src/a.ts' })
  })

  it('dispatches patch to apply_patch', async () => {
    vi.mocked(applyPatch.execute).mockResolvedValue({ applied: true })
    await editFiles.execute({
      mode: 'patch',
      patch_text: '*** Begin Patch\n*** End Patch',
    })
    expect(applyPatch.execute).toHaveBeenCalledWith({
      patch_text: '*** Begin Patch\n*** End Patch',
    })
  })

  it('rejects invalid input', async () => {
    const result = await editFiles.execute({ mode: 'replace' })
    expect(result).toMatchObject({ error: 'Invalid edit_files input.' })
  })
})
