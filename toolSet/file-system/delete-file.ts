import { promises as fs } from 'fs'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  requireActiveSandbox,
  resolveScopedPathInContext,
  getWorkspacePathFromEnv,
  sandboxPathError,
} from '../sandbox-paths'
import { FILE_SYSTEM_TAG, WORKSPACE_PATH_HINT } from './constants'
import { buildFileChangePreview } from './file-io-utils'

export const deleteFile: SkillTool = {
  name: 'delete_file',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Delete a single file in the user project. ${WORKSPACE_PATH_HINT} Directories are not supported.`,
  inputSchema: z.object({
    path: z.string().min(1),
  }),
  needsApproval: true,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const rawPath = input['path']
    if (typeof rawPath !== 'string' || rawPath.trim() === '') {
      return { error: 'Invalid path: expected a non-empty string.' }
    }

    let targetPath: string
    try {
      targetPath = resolveScopedPathInContext(sandbox.root, workspacePath, rawPath)
    } catch (err) {
      return sandboxPathError(err)
    }

    try {
      const stats = await fs.stat(targetPath)
      if (!stats.isFile()) {
        return { error: `Path is not a file: ${targetPath}` }
      }

      const contentOld = await fs.readFile(targetPath, 'utf-8')
      await fs.unlink(targetPath)

      const fileChange = buildFileChangePreview(
        sandbox.root,
        targetPath,
        contentOld,
        '',
        { action: 'delete', workspacePath },
      )

      return {
        deleted: true,
        path: targetPath,
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        diff: fileChange.diff,
        additions: fileChange.additions,
        deletions: fileChange.deletions,
        files: [fileChange],
      }
    } catch (error) {
      return { error: String(error), path: targetPath }
    }
  },
}
