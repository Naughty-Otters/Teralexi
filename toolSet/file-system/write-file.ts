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
import { buildFileChangePreview, readTextFileIfExists } from './file-io-utils'

export const writeFile: SkillTool = {
  name: 'write_file',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Write text data to a file in the user project. Prefer edit_file for partial edits; use write_file for new files or full rewrites. ${WORKSPACE_PATH_HINT}`,
  inputSchema: z.object({
    path: z.string().min(1),
    data: z.string(),
    overwrite: z.boolean().optional().default(false),
    createDirectories: z.boolean().optional().default(true),
    encoding: z
      .enum(['utf8', 'ascii', 'base64', 'hex', 'latin1'])
      .optional()
      .default('utf8'),
  }),
  needsApproval: true,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const rawPath = input['path']
    const rawData = input['data']
    const overwrite = Boolean(input['overwrite'])
    const createDirectories =
      input['createDirectories'] === undefined
        ? true
        : Boolean(input['createDirectories'])
    const rawEncoding = input['encoding']

    if (typeof rawPath !== 'string' || rawPath.trim() === '') {
      return { error: 'Invalid path: expected a non-empty string.' }
    }
    if (typeof rawData !== 'string') {
      return { error: 'Invalid data: expected a string.' }
    }

    let targetPath: string
    try {
      targetPath = resolveScopedPathInContext(sandbox.root, workspacePath, rawPath)
    } catch (err) {
      return sandboxPathError(err)
    }

    const encoding =
      typeof rawEncoding === 'string' && rawEncoding.trim() !== ''
        ? (rawEncoding as BufferEncoding)
        : ('utf8' as BufferEncoding)

    try {
      const contentOld =
        encoding === 'utf8' ? ((await readTextFileIfExists(targetPath)) ?? '') : ''

      if (!overwrite) {
        try {
          await fs.access(targetPath)
          return { error: `File already exists: ${targetPath}` }
        } catch {
          // target does not exist, continue
        }
      }

      if (createDirectories) {
        await fs.mkdir(path.dirname(targetPath), { recursive: true })
      }

      await fs.writeFile(targetPath, rawData, { encoding })
      const stats = await fs.stat(targetPath)

      const result: Record<string, unknown> = {
        written: true,
        path: targetPath,
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        size: stats.size,
        encoding,
      }

      if (encoding === 'utf8') {
        const fileChange = buildFileChangePreview(
          sandbox.root,
          targetPath,
          contentOld,
          rawData,
          { action: contentOld ? 'modify' : 'create', workspacePath },
        )
        result.diff = fileChange.diff
        result.additions = fileChange.additions
        result.deletions = fileChange.deletions
        result.files = [fileChange]
      }

      return result
    } catch (error) {
      return { error: String(error), path: targetPath }
    }
  },
}
