import { summarizeToolInput } from './summarize-tool-input'

function inputRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as Record<string, unknown>
}

function pickPath(record: Record<string, unknown> | null): string {
  if (!record) return ''
  for (const key of [
    'path',
    'file_path',
    'target_file',
    'scriptRelativePath',
    'from',
    'to',
  ]) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function quote(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '""'
  if (trimmed.length > 96) return `"${trimmed.slice(0, 93)}…"`
  return `"${trimmed}"`
}

function quotePath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'the project'
  if (trimmed.length > 96) return `\`${trimmed.slice(0, 93)}…\``
  return `\`${trimmed}\``
}

function formatGitAction(toolName: string, input: Record<string, unknown> | null): string {
  const sub = toolName.slice('git_'.length).replace(/_/g, ' ')
  const action = typeof input?.action === 'string' ? input.action.trim() : ''
  const branch =
    typeof input?.branch === 'string' && input.branch.trim()
      ? input.branch.trim()
      : typeof input?.name === 'string' && input.name.trim()
        ? input.name.trim()
        : ''
  const message =
    typeof input?.message === 'string' && input.message.trim()
      ? input.message.trim()
      : ''

  if (toolName === 'git_status') return 'Check repository status'
  if (toolName === 'git_diff') return 'Review code changes'
  if (toolName === 'git_log') return 'Browse commit history'
  if (toolName === 'git_commit') {
    return message
      ? `Commit changes: ${quote(message)}`
      : 'Commit staged changes'
  }
  if (toolName === 'git_branch' && branch) {
    return action
      ? `${action} branch ${quotePath(branch)}`
      : `Work with branch ${quotePath(branch)}`
  }
  if (toolName === 'git_checkout' && branch) {
    return `Switch to branch ${quotePath(branch)}`
  }
  if (toolName === 'git_pull') return 'Pull latest changes from remote'
  if (toolName === 'git_push') return 'Push commits to remote'
  if (toolName === 'git_add') return 'Stage files for commit'
  if (toolName === 'git_clone') {
    const url = typeof input?.url === 'string' ? input.url.trim() : ''
    return url ? `Clone repository ${quote(url)}` : 'Clone repository'
  }
  return `Run git ${sub}${action ? ` (${action})` : ''}`
}

/** User-facing sentence describing what a tool call is doing. */
export function formatToolHumanReadableAction(
  toolName: string,
  input?: unknown,
): string {
  const name = toolName.trim().toLowerCase() || 'tool'
  const record = inputRecord(input)
  const path = pickPath(record)

  switch (name) {
    case 'list_files':
      return `Browse files in folder ${quotePath(path || '.')}`
    case 'search_files': {
      const query = typeof record?.query === 'string' ? record.query.trim() : ''
      const folder = path || '.'
      if (query) {
        return `Search for ${quote(query)} in ${quotePath(folder)}`
      }
      return `Search files in ${quotePath(folder)}`
    }
    case 'glob_files': {
      const pattern =
        typeof record?.pattern === 'string' ? record.pattern.trim() : ''
      return pattern
        ? `Find files matching ${quote(pattern)}`
        : 'Find files by name pattern'
    }
    case 'grep_files': {
      const pattern =
        typeof record?.pattern === 'string' ? record.pattern.trim() : ''
      const scope = path || '.'
      return pattern
        ? `Search code for ${quote(pattern)} in ${quotePath(scope)}`
        : `Search code in ${quotePath(scope)}`
    }
    case 'read_file':
      return `Read file ${quotePath(path || 'file')}`
    case 'write_file':
      return `Write file ${quotePath(path || 'file')}`
    case 'edit_file':
      return `Edit file ${quotePath(path || 'file')}`
    case 'apply_patch':
      return `Apply changes to ${quotePath(path || 'file')}`
    case 'delete_file':
      return `Delete file ${quotePath(path || 'file')}`
    case 'move_file': {
      const from = typeof record?.from === 'string' ? record.from.trim() : ''
      const to = typeof record?.to === 'string' ? record.to.trim() : ''
      if (from && to) return `Move ${quotePath(from)} to ${quotePath(to)}`
      return 'Move a file'
    }
    case 'copy_file': {
      const from = typeof record?.from === 'string' ? record.from.trim() : ''
      const to = typeof record?.to === 'string' ? record.to.trim() : ''
      if (from && to) return `Copy ${quotePath(from)} to ${quotePath(to)}`
      return 'Copy a file'
    }
    case 'file_status':
      return path ? `Check status of ${quotePath(path)}` : 'Check file status'
    case 'storage_check':
      return 'Check project storage usage'
    case 'run_workspace_command': {
      const command = Array.isArray(record?.command)
        ? record.command.map(String).join(' ')
        : typeof record?.command === 'string'
          ? record.command.trim()
          : ''
      return command
        ? `Run command ${quote(command)}`
        : 'Run a workspace command'
    }
    case 'run_script':
      return 'Run an inline script'
    case 'run_script_file':
      return path
        ? `Run script ${quotePath(path)}`
        : 'Run a script file'
    case 'web_search': {
      const query = typeof record?.query === 'string' ? record.query.trim() : ''
      return query ? `Search the web for ${quote(query)}` : 'Search the web'
    }
    case 'web_scrape': {
      const url = typeof record?.url === 'string' ? record.url.trim() : ''
      return url ? `Read page ${quote(url)}` : 'Read a web page'
    }
    case 'deep_research': {
      const query = typeof record?.query === 'string' ? record.query.trim() : ''
      return query ? `Research ${quote(query)}` : 'Run deep research'
    }
    case 'lsp':
      return path
        ? `Inspect code structure in ${quotePath(path)}`
        : 'Inspect code structure'
    case 'read_todos':
      return 'Review task list'
    case 'update_todos':
      return 'Update task list'
    case 'enter_plan_mode':
      return 'Start planning'
    case 'exit_plan_mode':
      return 'Finish planning'
    case 'invoke_agent':
      return 'Delegate work to a specialist agent'
    case 'invoke_agents':
      return 'Delegate work to specialist agents'
    case 'wait_for_sub_agent_runs':
      return 'Wait for delegated agents to finish'
    case 'promote_artifact':
      return 'Promote output into the workspace'
    default:
      break
  }

  if (name.startsWith('git_')) {
    return formatGitAction(name, record)
  }

  const readable = name.replace(/_/g, ' ')
  const summary = summarizeToolInput(input, 80)
  return summary ? `${readable}: ${summary}` : `Run ${readable}`
}

/** Compact parameter summary for end-user tool cards. */
export function formatToolHumanReadableParams(
  toolName: string,
  input?: unknown,
): string {
  const summary = summarizeToolInput(input, 240)
  if (summary) return summary
  const name = toolName.trim().toLowerCase()
  if (!name) return ''
  return name.replace(/_/g, ' ')
}
