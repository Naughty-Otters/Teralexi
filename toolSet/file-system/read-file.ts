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
import { FILE_SYSTEM_TAG, MAX_READ_LINES, WORKSPACE_PATH_HINT } from './constants'
import { formatNumberedLines, isLikelyBinary } from './format-tool-output'
import { toToolAbsolutePath } from './file-io-utils'

export const readFile: SkillTool = {
  name: 'read_file',
  tags: [...FILE_SYSTEM_TAG],
  description:
    `Read a file or list a directory in the user project. Returns line-numbered content with optional offset/limit. ${WORKSPACE_PATH_HINT}`,
  inputSchema: z.object({
    path: z.string().min(1),
    encoding: z
      .enum(['utf8', 'ascii', 'base64', 'hex', 'latin1'])
      .optional()
      .default('utf8'),
    offset: z.number().min(1).optional().default(1),
    limit: z.number().min(1).optional().default(MAX_READ_LINES),
    reason: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Only when re-reading the same path and line window already loaded this session: brief explanation (e.g. "file edited after patch") or use a new offset instead.',
      ),
  }),
  needsApproval: false,
  async execute(input) {
    const sandbox = requireActiveSandbox()
    if (!sandbox.ok) return { error: sandbox.message }
    const workspacePath = getWorkspacePathFromEnv()

    const rawPath = input['path']
    const rawEncoding = input['encoding']
    const offset = Math.max(1, Number(input['offset'] ?? 1))
    const limit = Math.max(1, Number(input['limit'] ?? MAX_READ_LINES))

    if (typeof rawPath !== 'string' || rawPath.trim() === '') {
      return { error: 'Invalid path: expected a non-empty string.' }
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
      await fs.access(targetPath)
      const stats = await fs.stat(targetPath)

      if (stats.isDirectory()) {
        const entries = await fs.readdir(targetPath)
        entries.sort()
        return {
          path: toToolAbsolutePath(targetPath),
          sandboxRoot: sandbox.root,
          workspacePath: workspacePath ?? undefined,
          isDirectory: true,
          entries,
        }
      }

      if (!stats.isFile()) {
        return { error: `Path is not a file: ${targetPath}` }
      }

      if (encoding !== 'utf8') {
        const content = await fs.readFile(targetPath, { encoding })
        return {
          path: toToolAbsolutePath(targetPath),
          sandboxRoot: sandbox.root,
          workspacePath: workspacePath ?? undefined,
          content,
          size: stats.size,
          encoding,
          modifiedAt: stats.mtime.toISOString(),
        }
      }

      const buffer = await fs.readFile(targetPath)
      if (isLikelyBinary(buffer)) {
        return {
          error: `Binary file cannot be read as text: ${targetPath}`,
          path: targetPath,
        }
      }

      const fullText = buffer.toString('utf-8')
      const allLines = fullText.split('\n')
      const totalLines = allLines.length
      const startIdx = offset - 1
      const selectedLines = allLines.slice(startIdx, startIdx + limit)
      const { text, truncated, linesShown } = formatNumberedLines(selectedLines, offset)

      const result: Record<string, unknown> = {
        path: toToolAbsolutePath(targetPath),
        sandboxRoot: sandbox.root,
        workspacePath: workspacePath ?? undefined,
        content: text,
        size: stats.size,
        encoding,
        modifiedAt: stats.mtime.toISOString(),
        offset,
        limit,
        totalLines,
        linesShown,
      }

      if (truncated) {
        result.note = `Output truncated at 50KB. Use offset=${offset + linesShown} to read more.`
      } else if (startIdx + limit < totalLines) {
        result.note = `Showing lines ${offset}-${offset + linesShown - 1} of ${totalLines}. Use offset=${offset + linesShown} to read more.`
      }

      return result
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { error: `File not found: ${targetPath}` }
      }
      return { error: String(error), path: targetPath }
    }
  },
}
