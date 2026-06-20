export type WorkspaceSlashAction =
  | { kind: 'status' }
  | { kind: 'clear' }
  | { kind: 'pick' }
  | { kind: 'set'; path: string }

export const WORKSPACE_SLASH_COMMAND_RE = /^\/workspace(?:\s+([\s\S]*))?$/i

export function parseWorkspaceSlashCommand(
  text: string,
): WorkspaceSlashAction | null {
  const trimmed = text.trim()
  const match = trimmed.match(WORKSPACE_SLASH_COMMAND_RE)
  if (!match) return null

  const argsRaw = (match[1] ?? '').trim()
  if (!argsRaw) return { kind: 'status' }

  const lower = argsRaw.toLowerCase()
  if (lower === 'clear') return { kind: 'clear' }
  if (lower === 'pick') return { kind: 'pick' }

  const quoted = argsRaw.match(/^["'](.+)["']$/)
  if (quoted?.[1]?.trim()) {
    return { kind: 'set', path: quoted[1].trim() }
  }

  return { kind: 'set', path: argsRaw }
}

export function isWorkspaceSlashCommand(text: string): boolean {
  return parseWorkspaceSlashCommand(text) !== null
}

export function formatWorkspaceSlashHelp(): string {
  return [
    '/workspace — Show the current workspace folder',
    '/workspace pick — Choose a folder with the file picker',
    '/workspace <path> — Set workspace to a folder path (e.g. /workspace ~/code/my-app)',
    '/workspace clear — Clear workspace and use sandbox only',
  ].join('\n')
}

export function describeWorkspaceSlashStatus(
  workspacePath: string | null | undefined,
  pendingPath: string | null | undefined,
  hasConversation: boolean,
): string {
  const active = workspacePath?.trim()
  const pending = pendingPath?.trim()

  if (active) {
    return `Workspace: ${active}`
  }
  if (pending && !hasConversation) {
    return `Workspace for next conversation: ${pending}`
  }
  return 'Workspace: sandbox only (no project folder set)'
}
