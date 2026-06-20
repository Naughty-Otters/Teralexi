export type WorkspaceEntry =
  | { type: 'sandbox' }
  | { type: 'workspace'; path: string }

/** UI stack: sandbox floor plus optional user workspace folder. */
export function conversationWorkspaceStack(
  workspacePath: string | null | undefined,
): WorkspaceEntry[] {
  const trimmed = workspacePath?.trim()
  if (!trimmed) return [{ type: 'sandbox' }]
  return [{ type: 'sandbox' }, { type: 'workspace', path: trimmed }]
}

export function workspacePathFromStack(
  stack: readonly WorkspaceEntry[],
): string | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i]
    if (entry?.type === 'workspace') return entry.path
  }
  return null
}

/** Last path segment; works for POSIX and Windows separators. */
export function workspaceBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

export function workspaceActiveLabel(
  workspacePath: string | null | undefined,
): string {
  const trimmed = workspacePath?.trim()
  if (!trimmed) return 'Sandbox'
  return workspaceBasename(trimmed) || trimmed
}
