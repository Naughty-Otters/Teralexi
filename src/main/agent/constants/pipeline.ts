/** Non-LLM constants for agent pipeline steps (labels, UI, errors). */

export const STEP_ERRORS = {
  TOOL_NO_SKILL_ID: 'Tool execution unavailable for {toolName}: no skillId',
  TOOL_NOT_FOUND: 'Tool not found: {toolName}',
  MCP_SERVER_NOT_FOUND: 'MCP server not found: {serverId}',
  MCP_SERVER_DISABLED: 'MCP server is disabled: {serverId}',
  NO_OUTPUT: 'No output was produced.',
  EXECUTION_ERROR: 'Execution error: {detail}',
} as const

export const REFERENCE_CONTENT_LABELS = {
  DOC_PREFIX: '📄 Reference:',
  SCRIPT_LOAD_ERROR: '⚠️ Could not load script "{url}" ({type}): {error}',
  SCRIPT_HEADER: '### Reference script (`{type}`)',
  SCRIPT_PATH: '**Path:** `{url}`',
} as const

export const TODO_STATUS_LINES = {
  COMPLETED: '({id}) successfully completed with output: {output}.',
  FAILED_PAUSED: '({id}) failed (paused run; see step history for detail).',
  FAILED_AFTER_ATTEMPTS:
    '({id}) failed after {attempts} attempt{plural}: {summary}',
} as const

export const RETRY_CONTEXT = {
  FAILURE_REASON: '**Failure reason:**',
  PREVIOUS_OUTPUT: '**Previous output:**',
  RETRY_ATTEMPT: 'Retry attempt {attempt}/{maxAttempts}:',
} as const

export const LINK_EXPAND = {
  UNSUPPORTED_EXTENSION:
    'Unsupported reference extension (use text types: {extensions})',
  NOT_FOUND: 'Not found: {path}',
  COULD_NOT_RESOLVE: 'Could not resolve local path: {path}',
  LINKED_REFERENCE_HEADER: '### Linked reference: {label}',
  LINKED_REFERENCE_SOURCE: '**Source:** {href}',
  EXPANDED_LINKS_SECTION:
    '## Expanded markdown links (fetched once per URL this run)',
  TRUNCATED: '[truncated]',
  OMITTED_SIZE: '_(Further linked references omitted: size limit {max} chars)_',
} as const

export const STEP_HELPERS_LABELS = {
  TOOL_ERROR_BLOCK: '\n\n### Tool error ({id})\n{error}\n',
  TASK: 'Task:',
  DESCRIPTION: 'Description:',
  SUCCESS_CRITERIA: 'Success criteria:',
  REFERENCE_SCRIPTS: 'Reference scripts:',
  OVERALL_GOAL: 'Overall goal:',
  PLAN_STEP: 'Plan step:',
} as const
