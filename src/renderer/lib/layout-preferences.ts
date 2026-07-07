import { ref, watch, type Ref } from 'vue'

export const LAYOUT_PREF_KEYS = {
  sidebarCollapsed: 'teralexi.agent.sidebarCollapsed',
  reportPanelOpen: 'teralexi.agent.reportPanelOpen',
  workspaceSplitPanelOpen: 'teralexi.agent.workspaceSplitPanelOpen',
  lastConversationId: 'teralexi.agent.lastConversationId',
} as const

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
