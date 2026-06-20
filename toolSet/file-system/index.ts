import type { SkillTool } from '@main/skills/actions'
import { applyPatch } from './apply-patch'
import { copyFile, moveFile } from './copy-move'
import { deleteFile } from './delete-file'
import { editFile } from './edit-file'
import { runWorkspaceCommand } from './run-workspace-command'
import { globFiles } from './glob-files'
import { grepFiles } from './grep-files'
import { fileStatus, listFiles, storageCheck } from './list-files'
import { promoteArtifact } from './promote-artifact'
import { readFile } from './read-file'
import { searchFiles } from './search-files'
import { writeFile } from './write-file'

export * from './apply-patch'
export * from './file-change-preview'
export * from './copy-move'
export * from './edit-file'
export * from './edit-replace'
export * from './glob-files'
export * from './grep-files'
export * from './list-files'
export * from './permission-keys'
export * from './read-file'
export * from './search-files'
export * from './write-file'
export * from './delete-file'
export * from './run-workspace-command'
export * from './promote-artifact'

export {
  listFiles,
  searchFiles,
  fileStatus,
  storageCheck,
  moveFile,
  copyFile,
  writeFile,
  readFile,
  editFile,
  grepFiles,
  globFiles,
  applyPatch,
  deleteFile,
  runWorkspaceCommand,
  promoteArtifact,
}

export const fileSystemTools: SkillTool[] = [
  listFiles,
  searchFiles,
  fileStatus,
  storageCheck,
  moveFile,
  copyFile,
  readFile,
  writeFile,
  editFile,
  grepFiles,
  globFiles,
  applyPatch,
  deleteFile,
  runWorkspaceCommand,
  promoteArtifact,
]
