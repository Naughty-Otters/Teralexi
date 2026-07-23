export const FILE_SYSTEM_TAG = ['file-system'] as const

/** Paths for reading/editing the user's project when a workspace folder is set. */
export const WORKSPACE_PATH_HINT =
  'Paths may be workspace-relative (e.g. src/foo.ts), absolute under the project root, or absolute paths returned by prior tool results. Always call this tool — do not assume host paths are inaccessible.'

/** When a tool can also target sandbox artifact directories. */
export const SANDBOX_ARTIFACT_HINT =
  ' Paths under output/, scripts/, refs/, or skills/ resolve to the agent sandbox, not the user repo.'

/** @deprecated Use WORKSPACE_PATH_HINT */
export const DUAL_ROOT_PATH_HINT = `${WORKSPACE_PATH_HINT}${SANDBOX_ARTIFACT_HINT}`

export const MAX_GREP_MATCHES = 100
export const MAX_GLOB_PATHS = 100
export const MAX_LINE_CHARS = 2000
export const MAX_READ_LINES = 2000
export const MAX_READ_OUTPUT_BYTES = 50 * 1024
