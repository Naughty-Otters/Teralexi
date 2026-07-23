export const PLANNING_TAG = ['planning'] as const

export const ENTER_PLAN_MODE_TOOL_NAME = 'enter_plan_mode' as const
export const EXIT_PLAN_MODE_TOOL_NAME = 'exit_plan_mode' as const

export const PLAN_MODE_TOOL_NAMES = new Set<string>([
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
])

/** File tools that may write only the active plan file while plan mode is active. */
export const PLAN_FILE_WRITE_TOOLS = new Set(['edit_files'])

/** Read-only file / workspace IO allowed during agent plan mode. */
export const PLAN_MODE_FILE_IO_TOOLS = new Set(['read_file', 'lsp'])

/** External research tools allowed during agent plan mode. */
export const PLAN_MODE_RESEARCH_TOOLS = new Set(['web_search', 'web_scrape'])

/** Read-only git inspection during agent plan mode (via shell). */
export const PLAN_MODE_GIT_READ_TOOLS = new Set<string>([])

/**
 * Always included in skill catalogs and forced on while agent plan mode is active,
 * regardless of skill `allowed_tools` or user AvailableSet customization.
 */
export const PLAN_MODE_ALWAYS_IN_CATALOG_TOOL_NAMES = new Set([
  ...PLAN_MODE_FILE_IO_TOOLS,
  ...PLAN_MODE_RESEARCH_TOOLS,
  'read_todos',
  'update_todos',
])
