import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'
import type { SkillTool } from '@main/skills/actions'
import {
  requireActiveSandbox,
  resolvePathInContext,
  getWorkspacePathFromEnv,
  sandboxPathError,
} from '../sandbox-paths'
import { FILE_SYSTEM_TAG, WORKSPACE_PATH_HINT } from './constants'
import { buildFileChangePreview, readTextFileIfExists } from './file-io-utils'
import { deriveNewContentsFromChunks, parsePatch, type Hunk } from './patch-parse'

interface AppliedChange {
  path: string
  action: 'A' | 'M' | 'D'
  previousContent?: string
  newContent?: string
  moveFrom?: string
}

function resolveHunkPath(sandboxRoot: string, workspacePath: string | null, relativePath: string): string {
  return resolvePathInContext(sandboxRoot, workspacePath, relativePath)
}

async function applyHunk(
  sandboxRoot: string,
  workspacePath: string | null,
  hunk: Hunk,
): Promise<AppliedChange> {
  switch (hunk.type) {
    case 'add': {
      const targetPath = resolveHunkPath(sandboxRoot, workspacePath, hunk.path)
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, hunk.contents, 'utf-8')
      return { path: targetPath, action: 'A', newContent: hunk.contents }
    }
    case 'delete': {
      const targetPath = resolveHunkPath(sandboxRoot, workspacePath, hunk.path)
      const previousContent = await fs.readFile(targetPath, 'utf-8')
      await fs.unlink(targetPath)
      return { path: targetPath, action: 'D', previousContent }
    }
    case 'update': {
      const sourcePath = resolveHunkPath(sandboxRoot, workspacePath, hunk.path)
      const previousContent = await fs.readFile(sourcePath, 'utf-8')
      const newContent = deriveNewContentsFromChunks(sourcePath, hunk.chunks, previousContent)

      if (hunk.move_path) {
        const destPath = resolveHunkPath(sandboxRoot, workspacePath, hunk.move_path)
        await fs.mkdir(path.dirname(destPath), { recursive: true })
        await fs.writeFile(destPath, newContent, 'utf-8')
        await fs.unlink(sourcePath)
        return {
          path: destPath,
          action: 'M',
          previousContent,
          newContent,
          moveFrom: sourcePath,
        }
      }

      await fs.writeFile(sourcePath, newContent, 'utf-8')
      return { path: sourcePath, action: 'M', previousContent, newContent }
    }
  }
}

async function rollbackChanges(changes: AppliedChange[]): Promise<void> {
  for (const change of [...changes].reverse()) {
    try {
      if (change.action === 'A') {
        await fs.unlink(change.path).catch(() => undefined)
      } else if (change.action === 'D' && change.previousContent !== undefined) {
        await fs.mkdir(path.dirname(change.path), { recursive: true })
        await fs.writeFile(change.path, change.previousContent, 'utf-8')
      } else if (change.action === 'M') {
        if (change.moveFrom && change.previousContent !== undefined) {
          await fs.writeFile(change.moveFrom, change.previousContent, 'utf-8')
          await fs.unlink(change.path).catch(() => undefined)
        } else if (change.previousContent !== undefined) {
          await fs.writeFile(change.path, change.previousContent, 'utf-8')
        }
      }
    } catch {
      // best-effort rollback
    }
  }
}

export const applyPatch: SkillTool = {
  name: 'apply_patch',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Apply a multi-file patch in the user project (*** Begin Patch ... *** End Patch). Rolls back on first failure. ${WORKSPACE_PATH_HINT}`,
  inputSchema: z.object({
    patch_text: z.string().min(1),
  }),
  needsApproval: true,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const patchText = input['patch_text']
    if (typeof patchText !== 'string' || patchText.trim() === '') {
      return { error: 'Invalid patch_text: expected a non-empty string.' }
    }

    let hunks: Hunk[]
    try {
      ;({ hunks } = parsePatch(patchText))
    } catch (err) {
      return { error: String(err) }
    }

    if (hunks.length === 0) {
      return { error: 'No files were modified.' }
    }

    for (const hunk of hunks) {
      const paths =
        hunk.type === 'update' && hunk.move_path
          ? [hunk.path, hunk.move_path]
          : [hunk.path]
      for (const rel of paths) {
        try {
          resolvePathInContext(sandbox.root, workspacePath, rel)
        } catch (err) {
          return sandboxPathError(err)
        }
      }
    }

    const applied: AppliedChange[] = []
    const summary: string[] = []
    const files: ReturnType<typeof buildFileChangePreview>[] = []
    let additions = 0
    let deletions = 0

    try {
      for (const hunk of hunks) {
        const change = await applyHunk(sandbox.root, workspacePath, hunk)
        applied.push(change)
        summary.push(`${change.action} ${path.relative(sandbox.root, change.path)}`)

        const oldContent =
          change.action === 'A'
            ? ''
            : (change.previousContent ?? (await readTextFileIfExists(change.path)) ?? '')
        const newContent =
          change.action === 'D'
            ? ''
            : (change.newContent ?? (await readTextFileIfExists(change.path)) ?? '')

        const action =
          change.action === 'A'
            ? 'create'
            : change.action === 'D'
              ? 'delete'
              : change.moveFrom
                ? 'rename'
                : 'modify'

        const fileChange = buildFileChangePreview(
          sandbox.root,
          change.path,
          oldContent,
          newContent,
          {
            action,
            moveFrom: change.moveFrom,
            workspacePath,
          },
        )
        files.push(fileChange)
        additions += fileChange.additions
        deletions += fileChange.deletions
      }

      return {
        applied: true,
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        summary: summary.join('\n'),
        diff: files.map((file) => file.diff).filter(Boolean).join('\n'),
        additions,
        deletions,
        filesChanged: applied.length,
        files,
      }
    } catch (err) {
      await rollbackChanges(applied)
      return { error: String(err), rolledBack: applied.length > 0 }
    }
  },
}
