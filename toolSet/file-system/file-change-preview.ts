import { promises as fs } from 'fs'
import type { FileChangeAction, FileChangePreview, FileChangePreviewResult, FileChangeToolName } from '@shared/file-change/types'
import { isFileChangeToolName } from '@shared/file-change/types'
import {
  requireActiveSandbox,
  getWorkspacePathFromEnv,
  resolvePathInContext,
  resolveScopedPathInContext,
  sandboxPathError,
} from '../sandbox-paths'
import {
  buildFileChangePreview,
  convertToLineEnding,
  detectLineEnding,
  normalizeLineEndings,
  readTextFileIfExists,
} from './file-io-utils'
import { replace } from './edit-replace'
import { deriveNewContentsFromChunks, parsePatch, type Hunk } from './patch-parse'
import { previewPromoteArtifact } from './promote-artifact'

async function previewEditFile(input: Record<string, unknown>): Promise<FileChangePreviewResult> {
  const sandbox = requireActiveSandbox()
  if (!sandbox.ok) return { ok: false, error: sandbox.message }

  const rawPath = input.path
  const oldString = input.old_string
  const newString = input.new_string
  const replaceAll = Boolean(input.replace_all)

  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, error: 'Invalid path: expected a non-empty string.' }
  }
  if (typeof oldString !== 'string' || typeof newString !== 'string') {
    return { ok: false, error: 'old_string and new_string must be strings.' }
  }
  if (oldString === newString) {
    return { ok: false, error: 'No changes to apply: old_string and new_string are identical.' }
  }

  const workspacePath = getWorkspacePathFromEnv()
  let targetPath: string
  try {
    targetPath = resolveScopedPathInContext(sandbox.root, workspacePath, rawPath)
  } catch (err) {
    return sandboxPathError(err) as FileChangePreviewResult
  }

  if (oldString === '') {
    const contentOld = (await readTextFileIfExists(targetPath)) ?? ''
    const action: FileChangeAction = contentOld ? 'modify' : 'create'
    return {
      ok: true,
      files: [
        buildFileChangePreview(sandbox.root, targetPath, contentOld, newString, {
          action,
          workspacePath,
        }),
      ],
    }
  }

  const stats = await fs.stat(targetPath).catch(() => null)
  if (!stats) {
    return { ok: false, error: `File not found: ${targetPath}` }
  }
  if (!stats.isFile()) {
    return { ok: false, error: `Path is not a file: ${targetPath}` }
  }

  const contentOld = await fs.readFile(targetPath, 'utf-8')
  const ending = detectLineEnding(contentOld)
  const old = convertToLineEnding(normalizeLineEndings(oldString), ending)
  const replacement = convertToLineEnding(normalizeLineEndings(newString), ending)

  try {
    const contentNew = replace(contentOld, old, replacement, replaceAll)
    return {
      ok: true,
      files: [
        buildFileChangePreview(sandbox.root, targetPath, contentOld, contentNew, {
          action: 'modify',
          workspacePath,
        }),
      ],
    }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

async function previewWriteFile(input: Record<string, unknown>): Promise<FileChangePreviewResult> {
  const sandbox = requireActiveSandbox()
  if (!sandbox.ok) return { ok: false, error: sandbox.message }

  const rawPath = input.path
  const rawData = input.data
  const overwrite = Boolean(input.overwrite)
  const rawEncoding = input.encoding

  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, error: 'Invalid path: expected a non-empty string.' }
  }
  if (typeof rawData !== 'string') {
    return { ok: false, error: 'Invalid data: expected a string.' }
  }

  const workspacePath = getWorkspacePathFromEnv()
  let targetPath: string
  try {
    targetPath = resolveScopedPathInContext(sandbox.root, workspacePath, rawPath)
  } catch (err) {
    return sandboxPathError(err) as FileChangePreviewResult
  }

  const encoding =
    typeof rawEncoding === 'string' && rawEncoding.trim() !== ''
      ? rawEncoding
      : 'utf8'

  if (encoding !== 'utf8') {
    return { ok: false, error: 'Diff preview is only available for utf8 writes.' }
  }

  const exists = await fs.stat(targetPath).then(() => true).catch(() => false)
  if (exists && !overwrite) {
    return { ok: false, error: `File already exists: ${targetPath}` }
  }

  const contentOld = exists ? ((await readTextFileIfExists(targetPath)) ?? '') : ''
  const action: FileChangeAction = exists ? 'modify' : 'create'

  return {
    ok: true,
    files: [
      buildFileChangePreview(sandbox.root, targetPath, contentOld, rawData, {
        action,
        workspacePath,
      }),
    ],
  }
}

async function previewHunk(
  sandboxRoot: string,
  workspacePath: string | null,
  hunk: Hunk,
): Promise<{ row: FileChangePreview; error?: string }> {
  switch (hunk.type) {
    case 'add': {
      const targetPath = resolvePathInContext(sandboxRoot, workspacePath, hunk.path)
      return {
        row: buildFileChangePreview(sandboxRoot, targetPath, '', hunk.contents, {
          action: 'create',
          workspacePath,
        }),
      }
    }
    case 'delete': {
      const targetPath = resolvePathInContext(sandboxRoot, workspacePath, hunk.path)
      const previousContent = await fs.readFile(targetPath, 'utf-8')
      return {
        row: buildFileChangePreview(
          sandboxRoot,
          targetPath,
          previousContent,
          '',
          { action: 'delete', workspacePath },
        ),
      }
    }
    case 'update': {
      const sourcePath = resolvePathInContext(sandboxRoot, workspacePath, hunk.path)
      const previousContent = await fs.readFile(sourcePath, 'utf-8')
      const newContent = deriveNewContentsFromChunks(sourcePath, hunk.chunks, previousContent)

      if (hunk.move_path) {
        const destPath = resolvePathInContext(sandboxRoot, workspacePath, hunk.move_path)
        return {
          row: buildFileChangePreview(
            sandboxRoot,
            destPath,
            previousContent,
            newContent,
            { action: 'rename', moveFrom: sourcePath, workspacePath },
          ),
        }
      }

      return {
        row: buildFileChangePreview(
          sandboxRoot,
          sourcePath,
          previousContent,
          newContent,
          { action: 'modify', workspacePath },
        ),
      }
    }
  }
}

async function previewApplyPatch(input: Record<string, unknown>): Promise<FileChangePreviewResult> {
  const sandbox = requireActiveSandbox()
  if (!sandbox.ok) return { ok: false, error: sandbox.message }

  const patchText = input.patch_text
  if (typeof patchText !== 'string' || !patchText.trim()) {
    return { ok: false, error: 'Invalid patch_text: expected a non-empty string.' }
  }

  let hunks: Hunk[]
  try {
    ;({ hunks } = parsePatch(patchText))
  } catch (err) {
    return { ok: false, error: String(err) }
  }

  if (hunks.length === 0) {
    return { ok: false, error: 'No files were modified.' }
  }

  const workspacePath = getWorkspacePathFromEnv()

  for (const hunk of hunks) {
    const paths =
      hunk.type === 'update' && hunk.move_path
        ? [hunk.path, hunk.move_path]
        : [hunk.path]
    for (const rel of paths) {
      try {
        resolvePathInContext(sandbox.root, workspacePath, rel)
      } catch (err) {
        return sandboxPathError(err) as FileChangePreviewResult
      }
    }
  }

  const files: FileChangePreview[] = []
  for (const hunk of hunks) {
    try {
      const { row } = await previewHunk(sandbox.root, workspacePath, hunk)
      files.push(row)
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  return { ok: true, files }
}

async function previewDeleteFile(input: Record<string, unknown>): Promise<FileChangePreviewResult> {
  const sandbox = requireActiveSandbox()
  if (!sandbox.ok) return { ok: false, error: sandbox.message }

  const rawPath = input.path
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return { ok: false, error: 'Invalid path: expected a non-empty string.' }
  }

  const workspacePath = getWorkspacePathFromEnv()
  let targetPath: string
  try {
    targetPath = resolveScopedPathInContext(sandbox.root, workspacePath, rawPath)
  } catch (err) {
    return sandboxPathError(err) as FileChangePreviewResult
  }

  const stats = await fs.stat(targetPath).catch(() => null)
  if (!stats) return { ok: false, error: `File not found: ${targetPath}` }
  if (!stats.isFile()) return { ok: false, error: `Path is not a file: ${targetPath}` }

  const contentOld = await fs.readFile(targetPath, 'utf-8')
  return {
    ok: true,
    files: [
      buildFileChangePreview(sandbox.root, targetPath, contentOld, '', {
        action: 'delete',
        workspacePath,
      }),
    ],
  }
}

export async function previewFileChange(
  toolName: string,
  input: Record<string, unknown>,
): Promise<FileChangePreviewResult> {
  if (!isFileChangeToolName(toolName)) {
    return { ok: false, error: `Unsupported tool for file preview: ${toolName}` }
  }

  switch (toolName as FileChangeToolName) {
    case 'edit_files': {
      const mode = typeof input.mode === 'string' ? input.mode : ''
      if (mode === 'replace') return previewEditFile(input)
      if (mode === 'write') return previewWriteFile(input)
      if (mode === 'delete') return previewDeleteFile(input)
      if (mode === 'patch') return previewApplyPatch(input)
      return { ok: false, error: `Unsupported edit_files mode: ${mode || '(missing)'}` }
    }
    case 'promote_artifact':
      return previewPromoteArtifact(input)
    default:
      return { ok: false, error: `Unsupported tool for file preview: ${toolName}` }
  }
}
