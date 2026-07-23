export type FileToolPermissionKey = 'read' | 'edit' | 'external_path'

export type FileToolPermissionAction = 'allow' | 'ask' | 'deny'

export interface FileToolPermissionRule {
  key: FileToolPermissionKey
  defaultAction: FileToolPermissionAction
}

export const FILE_TOOL_PERMISSION_KEYS: Record<string, FileToolPermissionRule> = {
  read_file: { key: 'read', defaultAction: 'allow' },
  edit_files: { key: 'edit', defaultAction: 'ask' },
  /** Internals used by edit_files — kept for preview/permission path extract. */
  write_file: { key: 'edit', defaultAction: 'ask' },
  edit_file: { key: 'edit', defaultAction: 'ask' },
  apply_patch: { key: 'edit', defaultAction: 'ask' },
  delete_file: { key: 'edit', defaultAction: 'ask' },
  promote_artifact: { key: 'edit', defaultAction: 'ask' },
  shell: { key: 'external_path', defaultAction: 'ask' },
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
      add(input.path)
      break
    case 'edit_files': {
      const mode = typeof input.mode === 'string' ? input.mode : ''
      if (mode === 'patch') break
      add(input.path)
      break
    }
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
