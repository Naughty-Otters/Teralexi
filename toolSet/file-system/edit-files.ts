import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import { FILE_SYSTEM_TAG, WORKSPACE_PATH_HINT } from './constants'
import { applyPatch } from './apply-patch'
import { deleteFile } from './delete-file'
import { editFile } from './edit-file'
import { writeFile } from './write-file'

/**
 * Flat object schema (not discriminatedUnion) so JSON Schema root is
 * `type: "object"`. Providers reject `oneOf`/`anyOf` roots (`type: null`).
 */
const editFilesSchema = z.object({
  mode: z
    .enum(['replace', 'write', 'delete', 'patch'])
    .describe(
      'replace = search/replace; write = full file; delete = remove file; patch = multi-file patch text',
    ),
  path: z
    .string()
    .min(1)
    .optional()
    .describe('File path (required for replace, write, delete)'),
  old_string: z
    .string()
    .optional()
    .describe('replace: text to find (empty string creates/overwrites the file)'),
  new_string: z
    .string()
    .optional()
    .describe('replace: replacement text'),
  replace_all: z
    .boolean()
    .optional()
    .describe('replace: replace every match when true'),
  data: z
    .string()
    .optional()
    .describe('write: full file contents'),
  overwrite: z
    .boolean()
    .optional()
    .describe('write: allow overwriting an existing file'),
  createDirectories: z
    .boolean()
    .optional()
    .describe('write: create parent directories'),
  encoding: z
    .enum(['utf8', 'ascii', 'base64', 'hex', 'latin1'])
    .optional()
    .describe('write: file encoding'),
  patch_text: z
    .string()
    .min(1)
    .optional()
    .describe('patch: *** Begin Patch *** multi-file patch body'),
})

type EditFilesInput = z.infer<typeof editFilesSchema>

function validateEditFilesInput(
  data: EditFilesInput,
): { ok: true; data: EditFilesInput } | { ok: false; error: string } {
  switch (data.mode) {
    case 'replace': {
      if (!data.path?.trim()) {
        return { ok: false, error: 'replace mode requires path.' }
      }
      if (typeof data.old_string !== 'string' || typeof data.new_string !== 'string') {
        return {
          ok: false,
          error: 'replace mode requires old_string and new_string.',
        }
      }
      return { ok: true, data }
    }
    case 'write': {
      if (!data.path?.trim()) {
        return { ok: false, error: 'write mode requires path.' }
      }
      if (typeof data.data !== 'string') {
        return { ok: false, error: 'write mode requires data.' }
      }
      return { ok: true, data }
    }
    case 'delete': {
      if (!data.path?.trim()) {
        return { ok: false, error: 'delete mode requires path.' }
      }
      return { ok: true, data }
    }
    case 'patch': {
      if (!data.patch_text?.trim()) {
        return { ok: false, error: 'patch mode requires patch_text.' }
      }
      return { ok: true, data }
    }
    default:
      return { ok: false, error: `Unsupported edit_files mode.` }
  }
}

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

    const validated = validateEditFilesInput(parsed.data)
    if (!validated.ok) {
      return { error: validated.error }
    }

    const data = validated.data
    switch (data.mode) {
      case 'replace':
        return editFile.execute({
          path: data.path!,
          old_string: data.old_string!,
          new_string: data.new_string!,
          replace_all: data.replace_all ?? false,
        })
      case 'write':
        return writeFile.execute({
          path: data.path!,
          data: data.data!,
          overwrite: data.overwrite ?? false,
          createDirectories: data.createDirectories ?? true,
          encoding: data.encoding ?? 'utf8',
        })
      case 'delete':
        return deleteFile.execute({ path: data.path! })
      case 'patch':
        return applyPatch.execute({ patch_text: data.patch_text! })
    }
  },
}
