import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import { FILE_SYSTEM_TAG, WORKSPACE_PATH_HINT } from './constants'
import { applyPatch } from './apply-patch'
import { deleteFile } from './delete-file'
import { editFile } from './edit-file'
import { writeFile } from './write-file'

const editFilesSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('replace'),
    path: z.string().min(1),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional().default(false),
  }),
  z.object({
    mode: z.literal('write'),
    path: z.string().min(1),
    data: z.string(),
    overwrite: z.boolean().optional().default(false),
    createDirectories: z.boolean().optional().default(true),
    encoding: z
      .enum(['utf8', 'ascii', 'base64', 'hex', 'latin1'])
      .optional()
      .default('utf8'),
  }),
  z.object({
    mode: z.literal('delete'),
    path: z.string().min(1),
  }),
  z.object({
    mode: z.literal('patch'),
    patch_text: z.string().min(1),
  }),
])

/**
 * Unified file mutation tool (Cursor-style single edit surface).
 * Dispatches to the existing specialized implementations.
 */
export const editFiles: SkillTool = {
  name: 'edit_files',
  tags: [...FILE_SYSTEM_TAG],
  description:
    'Create, update, or delete project files. ' +
    'Modes: `replace` (search/replace; empty old_string creates/overwrites), ' +
    '`write` (full file contents), `delete` (single file), `patch` (*** Begin Patch *** multi-file). ' +
    `Prefer replace for partial edits; write for new files or full rewrites. ${WORKSPACE_PATH_HINT}`,
  inputSchema: editFilesSchema,
  needsApproval: true,
  async execute(input) {
    const parsed = editFilesSchema.safeParse(input)
    if (!parsed.success) {
      return {
        error: 'Invalid edit_files input.',
        detail: parsed.error.flatten(),
      }
    }

    const data = parsed.data
    switch (data.mode) {
      case 'replace':
        return editFile.execute({
          path: data.path,
          old_string: data.old_string,
          new_string: data.new_string,
          replace_all: data.replace_all,
        })
      case 'write':
        return writeFile.execute({
          path: data.path,
          data: data.data,
          overwrite: data.overwrite,
          createDirectories: data.createDirectories,
          encoding: data.encoding,
        })
      case 'delete':
        return deleteFile.execute({ path: data.path })
      case 'patch':
        return applyPatch.execute({ patch_text: data.patch_text })
    }
  },
}
