import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  requireActiveSandbox,
  resolveScopedSandboxPath,
  resolveScopedPathInContext,
  getWorkspacePathFromEnv,
  sandboxPathError,
} from '../sandbox-paths'
import { FILE_SYSTEM_TAG, WORKSPACE_PATH_HINT } from './constants'
import { replace } from './edit-replace'
import {
  buildFileChangePreview,
  convertToLineEnding,
  detectLineEnding,
  normalizeLineEndings,
  readTextFileIfExists,
  withFileLock,
} from './file-io-utils'

export const editFile: SkillTool = {
  name: 'edit_file',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Apply a search/replace edit to a text file in the user project. Prefer this over write_file for partial edits; set old_string empty to create or overwrite. ${WORKSPACE_PATH_HINT}`,
  inputSchema: z.object({
    path: z.string().min(1),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional().default(false),
  }),
  needsApproval: true,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const rawPath = input['path']
    const oldString = input['old_string']
    const newString = input['new_string']
    const replaceAll = Boolean(input['replace_all'])

    if (typeof rawPath !== 'string' || rawPath.trim() === '') {
      return { error: 'Invalid path: expected a non-empty string.' }
    }
    if (typeof oldString !== 'string' || typeof newString !== 'string') {
      return { error: 'old_string and new_string must be strings.' }
    }
    if (oldString === newString) {
      return { error: 'No changes to apply: old_string and new_string are identical.' }
    }

    let targetPath: string
    try {
      targetPath = resolveScopedPathInContext(sandbox.root, workspacePath, rawPath)
    } catch (err) {
      return sandboxPathError(err)
    }

    try {
      return await withFileLock(targetPath, async () => {
        if (oldString === '') {
          const contentOld = (await readTextFileIfExists(targetPath)) ?? ''
          await fs.mkdir(path.dirname(targetPath), { recursive: true })
          await fs.writeFile(targetPath, newString, 'utf-8')
          const fileChange = buildFileChangePreview(
            sandbox.root,
            targetPath,
            contentOld,
            newString,
            { action: contentOld ? 'modify' : 'create', workspacePath },
          )
          return {
            written: true,
            path: targetPath,
            sandboxRoot: sandbox.root,
            workspacePath: workspacePath ?? undefined,
            diff: fileChange.diff,
            additions: fileChange.additions,
            deletions: fileChange.deletions,
            files: [fileChange],
          }
        }

        const stats = await fs.stat(targetPath).catch(() => null)
        if (!stats) {
          return { error: `File not found: ${targetPath}` }
        }
        if (!stats.isFile()) {
          return { error: `Path is not a file: ${targetPath}` }
        }

        const contentOld = await fs.readFile(targetPath, 'utf-8')
        const ending = detectLineEnding(contentOld)
        const old = convertToLineEnding(normalizeLineEndings(oldString), ending)
        const replacement = convertToLineEnding(normalizeLineEndings(newString), ending)
        const contentNew = replace(contentOld, old, replacement, replaceAll)

        await fs.writeFile(targetPath, contentNew, 'utf-8')
        const fileChange = buildFileChangePreview(
          sandbox.root,
          targetPath,
          contentOld,
          contentNew,
          { action: 'modify', workspacePath },
        )

        return {
          written: true,
          path: targetPath,
          sandboxRoot: sandbox.root,
          workspacePath: workspacePath ?? undefined,
          diff: fileChange.diff,
          additions: fileChange.additions,
          deletions: fileChange.deletions,
          files: [fileChange],
        }
      })
    } catch (error) {
      return { error: String(error), path: targetPath }
    }
  },
}
