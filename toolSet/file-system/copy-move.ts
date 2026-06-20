import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  assertMoveAllowed,
  requireActiveSandbox,
  resolvePathAllowingOutside,
  resolvePathInContext,
  getWorkspacePathFromEnv,
  sandboxPathError,
} from '../sandbox-paths'
import { FILE_SYSTEM_TAG, SANDBOX_ARTIFACT_HINT, WORKSPACE_PATH_HINT } from './constants'
import { buildFileChangePreview, movePath, readTextFileIfExists } from './file-io-utils'

export const moveFile: SkillTool = {
  name: 'move_file',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Move a file or directory. Destination must be in the user project or sandbox. ${WORKSPACE_PATH_HINT}${SANDBOX_ARTIFACT_HINT}`,
  inputSchema: z.object({
    source: z.string().min(1),
    destination: z.string().min(1),
    overwrite: z.boolean().optional(),
  }),
  needsApproval: true,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const source = input['source']
    const destination = input['destination']
    const overwrite = Boolean(input['overwrite'])

    if (typeof source !== 'string' || typeof destination !== 'string') {
      return null
    }

    let sourcePath: string
    let destinationPath: string
    try {
      sourcePath = resolvePathAllowingOutside(sandbox.root, source, workspacePath)
      destinationPath = resolvePathInContext(sandbox.root, workspacePath, destination)
      assertMoveAllowed(sandbox.root, workspacePath, sourcePath, destinationPath)
    } catch (err) {
      return sandboxPathError(err)
    }

    try {
      const stats = await fs.stat(sourcePath).catch(() => null)
      const contentOld =
        stats?.isFile() ? ((await readTextFileIfExists(sourcePath)) ?? '') : ''

      await movePath(sourcePath, destinationPath, overwrite)

      const result: Record<string, unknown> = {
        moved: true,
        from: sourcePath,
        to: destinationPath,
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
      }

      if (stats?.isFile()) {
        const contentNew = (await readTextFileIfExists(destinationPath)) ?? contentOld
        const fileChange = buildFileChangePreview(
          sandbox.root,
          destinationPath,
          contentOld,
          contentNew,
          { action: 'rename', moveFrom: sourcePath, workspacePath },
        )
        result.diff = fileChange.diff
        result.additions = fileChange.additions
        result.deletions = fileChange.deletions
        result.files = [fileChange]
      }

      return result
    } catch (error) {
      return { error: String(error) }
    }
  },
}

export const copyFile: SkillTool = {
  name: 'copy_file',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Copy a file. Destination must be in the user project or sandbox. ${WORKSPACE_PATH_HINT}${SANDBOX_ARTIFACT_HINT}`,
  inputSchema: z.object({
    source: z.string().min(1),
    destination: z.string().min(1),
    overwrite: z.boolean().optional(),
  }),
  needsApproval: true,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const source = input['source']
    const destination = input['destination']
    const overwrite = Boolean(input['overwrite'])

    if (typeof source !== 'string' || typeof destination !== 'string') {
      return null
    }

    let sourcePath: string
    let destinationPath: string
    try {
      sourcePath = resolvePathAllowingOutside(sandbox.root, source, workspacePath)
      destinationPath = resolvePathInContext(sandbox.root, workspacePath, destination)
    } catch (err) {
      return sandboxPathError(err)
    }

    try {
      if (!overwrite) {
        try {
          await fs.access(destinationPath)
          return { error: `Destination already exists: ${destinationPath}` }
        } catch {
          // destination does not exist — proceed
        }
      }

      const sourceStats = await fs.stat(sourcePath)
      if (!sourceStats.isFile()) {
        return { error: `Source is not a file: ${sourcePath}` }
      }

      const contentNew = (await readTextFileIfExists(sourcePath)) ?? ''

      await fs.mkdir(path.dirname(destinationPath), { recursive: true })
      await fs.copyFile(sourcePath, destinationPath)

      const fileChange = buildFileChangePreview(
        sandbox.root,
        destinationPath,
        '',
        contentNew,
        { action: 'create', workspacePath },
      )

      return {
        copied: true,
        from: sourcePath,
        to: destinationPath,
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        diff: fileChange.diff,
        additions: fileChange.additions,
        deletions: fileChange.deletions,
        files: [fileChange],
      }
    } catch (error) {
      return { error: String(error) }
    }
  },
}
