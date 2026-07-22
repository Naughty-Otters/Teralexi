import type { SkillTool } from '@main/skills/actions'
import { editFiles } from './edit-files'
import { shell, runWorkspaceCommand } from './run-workspace-command'
import { promoteArtifact } from './promote-artifact'
import { readFile } from './read-file'

/** Internals used by edit_files / preview — not catalog tools. */
export * from './apply-patch'
export * from './file-change-preview'
export * from './edit-file'
export * from './edit-files'
export * from './edit-replace'
export * from './permission-keys'
export * from './read-file'
export * from './write-file'
export * from './delete-file'
export * from './run-workspace-command'
export * from './promote-artifact'
export * from './file-io-utils'
export * from './format-tool-output'
export * from './patch-parse'
export * from './constants'

export {
  readFile,
  editFiles,
  shell,
  runWorkspaceCommand,
  promoteArtifact,
}

export const fileSystemTools: SkillTool[] = [
  readFile,
  editFiles,
  shell,
  promoteArtifact,
]
