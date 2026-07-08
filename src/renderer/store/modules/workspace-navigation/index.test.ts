import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  LAYOUT_PREF_KEYS,
  writeStoredBoolean,
  writeStoredString,
} from '@renderer/lib/layout-preferences'
import { useWorkspaceNavigationStore } from './index'

function createMemoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key: string) {
      return data.get(key) ?? null
    },
    key(index: number) {
      return [...data.keys()][index] ?? null
    },
    removeItem(key: string) {
      data.delete(key)
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
  }
}

describe('workspace-navigation store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists workspace panel open state per conversation', () => {
    const store = useWorkspaceNavigationStore()
    store.setWorkspacePanelOpen('conv-a', true)
    store.setWorkspacePanelOpen('conv-b', false)

    expect(store.isWorkspacePanelOpen('conv-a')).toBe(true)
    expect(store.isWorkspacePanelOpen('conv-b')).toBe(false)

    setActivePinia(createPinia())
    const reloaded = useWorkspaceNavigationStore()
    expect(reloaded.isWorkspacePanelOpen('conv-a')).toBe(true)
    expect(reloaded.isWorkspacePanelOpen('conv-b')).toBe(false)
  })

  it('persists workspace panel tab per conversation', () => {
    const store = useWorkspaceNavigationStore()
    store.setWorkspacePanelTab('conv-a', 'git')

    setActivePinia(createPinia())
    const reloaded = useWorkspaceNavigationStore()
    expect(reloaded.getWorkspacePanelTab('conv-a')).toBe('git')
    expect(reloaded.getWorkspacePanelTab('conv-b')).toBe('files')
  })

  it('migrates legacy global workspace split flag to last conversation', () => {
    writeStoredBoolean(LAYOUT_PREF_KEYS.workspaceSplitPanelOpen, true)
    writeStoredString(LAYOUT_PREF_KEYS.lastConversationId, 'legacy-conv')

    setActivePinia(createPinia())
    const store = useWorkspaceNavigationStore()
    expect(store.isWorkspacePanelOpen('legacy-conv')).toBe(true)
  })

  it('openInWorkspace marks conversation panel open and tab', () => {
    const store = useWorkspaceNavigationStore()
    store.openInWorkspace('src/a.ts', {
      tab: 'files',
      conversationId: 'conv-1',
    })

    expect(store.isWorkspacePanelOpen('conv-1')).toBe(true)
    expect(store.getWorkspacePanelTab('conv-1')).toBe('files')
    expect(store.consumeOpenSplitPanelRequest()).toBe(true)
  })
})
