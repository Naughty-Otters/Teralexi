import { ref, watch, type Ref } from 'vue'

export const LAYOUT_PREF_KEYS = {
  sidebarCollapsed: 'teralexi.agent.sidebarCollapsed',
  reportPanelOpen: 'teralexi.agent.reportPanelOpen',
  workspaceSplitPanelOpen: 'teralexi.agent.workspaceSplitPanelOpen',
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
