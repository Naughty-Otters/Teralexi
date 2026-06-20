export type FileToolPermissionKey = 'read' | 'edit' | 'grep' | 'glob' | 'external_path'

export type FileToolPermissionAction = 'allow' | 'ask' | 'deny'

export interface FileToolPermissionRule {
  key: FileToolPermissionKey
  defaultAction: FileToolPermissionAction
}

export const FILE_TOOL_PERMISSION_KEYS: Record<string, FileToolPermissionRule> = {
  read_file: { key: 'read', defaultAction: 'allow' },
  list_files: { key: 'read', defaultAction: 'allow' },
  glob_files: { key: 'glob', defaultAction: 'allow' },
  grep_files: { key: 'grep', defaultAction: 'allow' },
  search_files: { key: 'grep', defaultAction: 'allow' },
  file_status: { key: 'read', defaultAction: 'allow' },
  storage_check: { key: 'read', defaultAction: 'allow' },
  write_file: { key: 'edit', defaultAction: 'ask' },
  edit_file: { key: 'edit', defaultAction: 'ask' },
  apply_patch: { key: 'edit', defaultAction: 'ask' },
  delete_file: { key: 'edit', defaultAction: 'ask' },
  move_file: { key: 'edit', defaultAction: 'ask' },
  copy_file: { key: 'edit', defaultAction: 'ask' },
  promote_artifact: { key: 'edit', defaultAction: 'ask' },
  run_workspace_command: { key: 'external_path', defaultAction: 'ask' },
}

export function resolveFileToolPermissionKey(
  toolName: string,
): FileToolPermissionRule | undefined {
  return FILE_TOOL_PERMISSION_KEYS[toolName]
}

export function extractFileToolPaths(
  toolName: string,
  input: Record<string, unknown>,
): string[] {
  const paths: string[] = []
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim() !== '') {
      paths.push(value)
    }
  }

  switch (toolName) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
    case 'delete_file':
    case 'file_status':
    case 'list_files':
    case 'grep_files':
    case 'glob_files':
    case 'search_files':
      add(input.path)
      break
    case 'copy_file':
    case 'move_file':
      add(input.source)
      add(input.destination)
      break
    case 'promote_artifact':
      add(input.from)
      add(input.to)
      break
    case 'apply_patch':
      break
    default:
      break
  }

  return paths
}
