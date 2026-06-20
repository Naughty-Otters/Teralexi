import { realpathSync } from 'fs'
import { join, relative, resolve } from 'path'
import { getWorkflowSourceDir } from '@config/openfde-home'
import {
  ENTITIES_DEFINITION_JSON_FILENAME,
  WORKFLOW_DEFINITION_JSON_FILENAME,
} from '@shared/workflows/source-files'

export const WORKFLOW_COMPILER_TOOL_NAMES = [
  'list_workflow_files',
  'read_workflow_definition',
  'write_workflow_definition',
  'edit_workflow_definition',
  'read_entities_definition',
  'write_entities_definition',
  'edit_entities_definition',
  'add_entity_field',
  'update_entity_field',
  'delete_entity_field',
] as const

export type WorkflowCompilerToolName =
  (typeof WORKFLOW_COMPILER_TOOL_NAMES)[number]

export const WORKFLOW_COMPILER_ALLOWED_FILES = [
  WORKFLOW_DEFINITION_JSON_FILENAME,
  ENTITIES_DEFINITION_JSON_FILENAME,
] as const

export type WorkflowCompilerAllowedFile =
  (typeof WORKFLOW_COMPILER_ALLOWED_FILES)[number]

function resolvePathForContainment(filePath: string): string {
  const abs = resolve(filePath)
  let current = abs
  const tail: string[] = []
  for (;;) {
    try {
      const real = realpathSync(current)
      return tail.length > 0 ? join(real, ...tail) : real
    } catch {
      const parent = resolve(current, '..')
      if (parent === current) return abs
      tail.unshift(current.split('/').pop() ?? '')
      current = parent
    }
  }
}

function isInsideRoot(root: string, target: string): boolean {
  const resolvedRoot = resolvePathForContainment(root)
  const resolvedTarget = resolvePathForContainment(target)
  const rel = relative(resolvedRoot, resolvedTarget)
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))
}

/** Normalize a user/LLM path to an allowed workflow source filename. */
export function normalizeWorkflowSourceRelativePath(raw: string): WorkflowCompilerAllowedFile {
  const trimmed = raw.trim().replace(/^\/+/, '')
  const base = trimmed.split(/[/\\]/).pop() ?? trimmed
  if (
    !WORKFLOW_COMPILER_ALLOWED_FILES.includes(base as WorkflowCompilerAllowedFile)
  ) {
    throw new Error(
      `Path "${raw}" is not allowed. Edit only: ${WORKFLOW_COMPILER_ALLOWED_FILES.join(', ')}`,
    )
  }
  return base as WorkflowCompilerAllowedFile
}

function resolveWorkflowSourceFilePathInRoot(
  root: string,
  rawPath: string,
): string {
  const fileName = normalizeWorkflowSourceRelativePath(rawPath)
  const resolvedRoot = resolve(root)
  const abs = resolve(resolvedRoot, fileName)
  if (!isInsideRoot(resolvedRoot, abs)) {
    throw new Error(`Path "${rawPath}" escapes workflow source directory`)
  }
  return abs
}

export function resolveWorkflowSourceFilePath(
  workflowId: string,
  rawPath: string,
): string {
  return resolveWorkflowSourceFilePathInRoot(
    getWorkflowSourceDir(workflowId),
    rawPath,
  )
}

export function resolveWorkflowSourceFilePathForContext(
  ctx: { workflowId: string; sourceDir?: string },
  rawPath: string,
): string {
  const root = ctx.sourceDir ?? getWorkflowSourceDir(ctx.workflowId)
  return resolveWorkflowSourceFilePathInRoot(root, rawPath)
}

export function workflowSourceScopeError(err: unknown): { error: string } {
  const message =
    err instanceof Error ? err.message : 'Invalid workflow source path'
  return { error: message }
}

export function workflowSourceFolderHint(
  workflowId: string,
  sourceDir?: string,
): string {
  return resolve(sourceDir ?? getWorkflowSourceDir(workflowId))
}
