import { ref, watch, type Ref } from 'vue'

export const LAYOUT_PREF_KEYS = {
  sidebarCollapsed: 'teralexi.agent.sidebarCollapsed',
  reportPanelOpen: 'teralexi.agent.reportPanelOpen',
  /** @deprecated Migrated to workspacePanelOpenByConversation */
  workspaceSplitPanelOpen: 'teralexi.agent.workspaceSplitPanelOpen',
  workspacePanelOpenByConversation:
    'teralexi.agent.workspacePanelOpenByConversation',
  workspacePanelTabByConversation:
    'teralexi.agent.workspacePanelTabByConversation',
  workspaceEditorSessionByConversation:
    'teralexi.agent.workspaceEditorSessionByConversation',
  lastConversationId: 'teralexi.agent.lastConversationId',
  /** Sidebar conversation list: `none` | `agent` | `workspace` | `source` */
  conversationListGroupBy: 'teralexi.agent.conversationListGroupBy',
  /** Collapsed group keys for the sidebar list (`agent::id` / `workspace::path`). */
  conversationListCollapsedGroups:
    'teralexi.agent.conversationListCollapsedGroups',
  /** Which meta fields show under each conversation title (type / agent / date). */
  conversationListItemLabels: 'teralexi.agent.conversationListItemLabels',
} as const

export type WorkspaceEditorSession = {
  openPaths: string[]
  activePath: string | null
  filesDirectory?: string
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
    return fallback
  } catch {
    return fallback
  }
}

export function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStoredString(key: string): string | null {
  try {
    const raw = localStorage.getItem(key)?.trim()
    return raw || null
  } catch {
    return null
  }
}

export function writeStoredString(key: string, value: string | null): void {
  try {
    if (value?.trim()) {
      localStorage.setItem(key, value.trim())
      return
    }
    localStorage.removeItem(key)
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStoredBooleanMap(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, boolean> = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') out[id] = value
    }
    return out
  } catch {
    return {}
  }
}

export function writeStoredBooleanMap(
  key: string,
  value: Record<string, boolean>,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private mode */
  }
}

export function readStoredStringMap(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) out[id] = value.trim()
    }
    return out
  } catch {
    return {}
  }
}

export function writeStoredStringMap(
  key: string,
  value: Record<string, string>,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private mode */
  }
}

function normalizeEditorSession(value: unknown): WorkspaceEditorSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const openPaths = Array.isArray(record.openPaths)
    ? record.openPaths
        .filter((path): path is string => typeof path === 'string')
        .map((path) => path.replace(/\\/g, '/').trim())
        .filter(Boolean)
    : []
  const activeCandidate =
    typeof record.activePath === 'string'
      ? record.activePath.replace(/\\/g, '/').trim()
      : ''
  const activePath =
    activeCandidate && openPaths.includes(activeCandidate)
      ? activeCandidate
      : (openPaths.at(-1) ?? null)
  const filesDirectoryRaw =
    typeof record.filesDirectory === 'string'
      ? record.filesDirectory.replace(/\\/g, '/').trim()
      : ''
  const filesDirectory = filesDirectoryRaw || undefined
  return { openPaths, activePath, filesDirectory }
}

export function readStoredEditorSessionMap(
  key: string,
): Record<string, WorkspaceEditorSession> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, WorkspaceEditorSession> = {}
    for (const [id, value] of Object.entries(parsed)) {
      const session = normalizeEditorSession(value)
      if (session) out[id] = session
    }
    return out
  } catch {
    return {}
  }
}

export function writeStoredEditorSessionMap(
  key: string,
  value: Record<string, WorkspaceEditorSession>,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Boolean layout preference synced to localStorage for the user session. */
export function useLayoutPreference(
  key: string,
  fallback: boolean,
): Ref<boolean> {
  const value = ref(readStoredBoolean(key, fallback))
  watch(value, (next) => {
    writeStoredBoolean(key, next)
  })
  return value
}
