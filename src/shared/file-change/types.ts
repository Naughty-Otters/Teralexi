export type FileChangeAction = 'create' | 'modify' | 'delete' | 'rename'

export type FileChangePreview = {
  /**
   * Display path — relative to the workspace root when the file lives in the
   * user's project folder, otherwise relative to the sandbox root.
   */
  path: string
  diff: string
  additions: number
  deletions: number
  action?: FileChangeAction
  /** Source path when action is rename. */
  moveFrom?: string
  /**
   * Set when the file is inside the user's workspace folder.
   * Carried through so the renderer can label files appropriately.
   */
  workspacePath?: string
}

export type FileChangePreviewResult =
  | { ok: true; files: FileChangePreview[] }
  | { ok: false; error: string }

export const FILE_CHANGE_TOOL_NAMES = [
  'edit_files',
  'promote_artifact',
] as const

export type FileChangeToolName = (typeof FILE_CHANGE_TOOL_NAMES)[number]

export function isFileChangeToolName(name: string): boolean {
  return (FILE_CHANGE_TOOL_NAMES as readonly string[]).includes(name)
}
