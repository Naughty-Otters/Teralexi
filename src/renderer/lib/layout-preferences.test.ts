import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LAYOUT_PREF_KEYS,
  readStoredEditorSessionMap,
  writeStoredEditorSessionMap,
} from './layout-preferences'

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

describe('layout-preferences editor session map', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips editor sessions per conversation', () => {
    writeStoredEditorSessionMap(
      LAYOUT_PREF_KEYS.workspaceEditorSessionByConversation,
      {
        'conv-a': { openPaths: ['src/a.ts', 'src/b.ts'], activePath: 'src/a.ts' },
      },
    )

    const loaded = readStoredEditorSessionMap(
      LAYOUT_PREF_KEYS.workspaceEditorSessionByConversation,
    )
    expect(loaded['conv-a']).toEqual({
      openPaths: ['src/a.ts', 'src/b.ts'],
      activePath: 'src/a.ts',
    })
  })

  it('normalizes active path when it is missing from open tabs', () => {
    writeStoredEditorSessionMap(
      LAYOUT_PREF_KEYS.workspaceEditorSessionByConversation,
      {
        'conv-a': { openPaths: ['src/a.ts'], activePath: 'src/missing.ts' },
      },
    )

    const loaded = readStoredEditorSessionMap(
      LAYOUT_PREF_KEYS.workspaceEditorSessionByConversation,
    )
    expect(loaded['conv-a']?.activePath).toBe('src/a.ts')
  })

  it('round-trips files directory in editor sessions', () => {
    writeStoredEditorSessionMap(
      LAYOUT_PREF_KEYS.workspaceEditorSessionByConversation,
      {
        'conv-a': {
          openPaths: ['src/a.ts'],
          activePath: 'src/a.ts',
          filesDirectory: 'src/components',
        },
      },
    )

    const loaded = readStoredEditorSessionMap(
      LAYOUT_PREF_KEYS.workspaceEditorSessionByConversation,
    )
    expect(loaded['conv-a']?.filesDirectory).toBe('src/components')
  })
})
