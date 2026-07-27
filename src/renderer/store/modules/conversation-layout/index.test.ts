import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  LAYOUT_PREF_KEYS,
  writeStoredString,
} from '@renderer/lib/layout-preferences'
import { useConversationLayoutStore } from './index'
import { writeLayoutSnapshot } from './persist'
import { createLeaf } from './tree'

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

describe('conversation-layout store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('persists and restores a split layout', () => {
    const store = useConversationLayoutStore()
    store.ensureLayout('conv-a')
    store.splitFocused('right', 'conv-b')
    vi.runAllTimers()
    store.persistNow()

    setActivePinia(createPinia())
    const reloaded = useConversationLayoutStore()
    const focused = reloaded.hydrateFromStorage(
      new Set(['conv-a', 'conv-b']),
      'conv-a',
    )
    expect(focused).toBe('conv-b')
    expect(reloaded.leafCount).toBe(2)
    expect(reloaded.visibleConversationIdList).toEqual(['conv-a', 'conv-b'])
  })

  it('prunes deleted conversations on hydrate', () => {
    writeLayoutSnapshot({
      version: 1,
      focusedPaneId: 'pane-b',
      root: {
        type: 'group',
        orientation: 'horizontal',
        ratio: 0.4,
        children: [createLeaf('conv-a', 'pane-a'), createLeaf('conv-b', 'pane-b')],
      },
    })

    const store = useConversationLayoutStore()
    const focused = store.hydrateFromStorage(new Set(['conv-a']), null)
    expect(focused).toBe('conv-a')
    expect(store.leafCount).toBe(1)
    expect(store.root?.type).toBe('leaf')
  })

  it('falls back to lastConversationId when snapshot is empty', () => {
    writeStoredString(LAYOUT_PREF_KEYS.lastConversationId, 'conv-fallback')
    const store = useConversationLayoutStore()
    const focused = store.hydrateFromStorage(
      new Set(['conv-fallback', 'other']),
      'conv-fallback',
    )
    expect(focused).toBe('conv-fallback')
    expect(store.leafCount).toBe(1)
  })

  it('openConversation focuses an existing pane instead of duplicating', () => {
    const store = useConversationLayoutStore()
    store.ensureLayout('conv-a')
    store.splitFocused('down', 'conv-b')
    const paneId = store.openConversation('conv-a')
    expect(paneId).toBeTruthy()
    expect(store.focusedConversationId).toBe('conv-a')
    expect(store.leafCount).toBe(2)
  })

  it('refuses closing the last pane', () => {
    const store = useConversationLayoutStore()
    store.ensureLayout('conv-a')
    expect(store.canCloseFocused).toBe(false)
    expect(store.closeFocusedPane()).toBeNull()
    expect(store.leafCount).toBe(1)
  })
})
