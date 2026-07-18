/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useSkillComposerToolbar } from './useSkillComposerToolbar'

type InvokeFn = (args: unknown) => unknown | Promise<unknown>

function installIpc(handlers: Record<string, InvokeFn>) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const channel = {
    GetSkillComposerToolbarPlugins: {
      invoke: handlers.GetSkillComposerToolbarPlugins,
    },
    PreviewSkillComposerToolbarPlugin: {
      invoke: handlers.PreviewSkillComposerToolbarPlugin,
    },
    InvokeSkillComposerToolbarPlugin: {
      invoke: handlers.InvokeSkillComposerToolbarPlugin,
    },
    AgentStreamFinished: {
      on: (listener: (...args: unknown[]) => void) => {
        let set = listeners.get('AgentStreamFinished')
        if (!set) {
          set = new Set()
          listeners.set('AgentStreamFinished', set)
        }
        set.add(listener)
      },
      removeListener: (listener: (...args: unknown[]) => void) => {
        listeners.get('AgentStreamFinished')?.delete(listener)
      },
    },
    WorkspaceFilesChanged: {
      on: (listener: (...args: unknown[]) => void) => {
        let set = listeners.get('WorkspaceFilesChanged')
        if (!set) {
          set = new Set()
          listeners.set('WorkspaceFilesChanged', set)
        }
        set.add(listener)
      },
      removeListener: (listener: (...args: unknown[]) => void) => {
        listeners.get('WorkspaceFilesChanged')?.delete(listener)
      },
    },
    EntitlementChanged: {
      on: (listener: (...args: unknown[]) => void) => {
        let set = listeners.get('EntitlementChanged')
        if (!set) {
          set = new Set()
          listeners.set('EntitlementChanged', set)
        }
        set.add(listener)
      },
      removeListener: (listener: (...args: unknown[]) => void) => {
        listeners.get('EntitlementChanged')?.delete(listener)
      },
    },
  }

  ;(globalThis as typeof globalThis & { ipcRendererChannel?: unknown }).ipcRendererChannel =
    channel
  ;(window as typeof window & { ipcRendererChannel?: unknown }).ipcRendererChannel =
    channel

  return {
    emit(name: string, payload?: unknown) {
      for (const listener of listeners.get(name) ?? []) {
        listener({}, payload)
      }
    },
  }
}

describe('useSkillComposerToolbar', () => {
  let scope: ReturnType<typeof effectScope>

  beforeEach(() => {
    scope = effectScope(true)
  })

  afterEach(() => {
    scope.stop()
    delete (globalThis as typeof globalThis & { ipcRendererChannel?: unknown })
      .ipcRendererChannel
    delete (window as typeof window & { ipcRendererChannel?: unknown })
      .ipcRendererChannel
    vi.useRealTimers()
  })

  it('loads plugins, previews, then invokes with result fields', async () => {
    const getPlugins = vi.fn(async () => ({
      ok: true,
      plugins: [
        {
          id: 'publish-website',
          label: 'Publish website',
          icon: 'globe',
          enabled: true,
        },
      ],
    }))
    const previewInvoke = vi.fn(async () => ({
      ok: true,
      title: 'Publish website',
      siteDir: '/tmp/site',
      fileCount: 2,
      estimatedBytes: 100,
      sampleFiles: ['index.html', 'a.css'],
      truncatedRemaining: 0,
      targetHost: 'localhost:8000',
      uploadPath: 'api/v1/app/web/upload',
    }))
    const invokePlugin = vi.fn(async () => ({
      ok: true,
      absoluteUrl: 'http://localhost:8000/app/web/1/',
      uploadStatus: 200,
      verifyStatus: 200,
      fileCount: 2,
      bytes: 80,
    }))

    installIpc({
      GetSkillComposerToolbarPlugins: getPlugins,
      PreviewSkillComposerToolbarPlugin: previewInvoke,
      InvokeSkillComposerToolbarPlugin: invokePlugin,
    })

    const skillId = ref<string | null>('website')
    const conversationId = ref<string | null>('conv-1')

    const api = scope.run(() =>
      useSkillComposerToolbar({ skillId, conversationId }),
    )!

    await nextTick()
    await vi.waitFor(() => {
      expect(api.plugins.value).toHaveLength(1)
    })

    const preview = await api.preview('publish-website')
    expect(preview.ok).toBe(true)
    expect(previewInvoke).toHaveBeenCalledWith({
      skillId: 'website',
      conversationId: 'conv-1',
      pluginId: 'publish-website',
    })
    expect(api.lastPreview.value?.siteDir).toBe('/tmp/site')

    const result = await api.invoke('publish-website')
    expect(result).toMatchObject({
      ok: true,
      absoluteUrl: 'http://localhost:8000/app/web/1/',
      uploadStatus: 200,
      verifyStatus: 200,
    })
    expect(api.lastResult.value?.absoluteUrl).toBe(
      'http://localhost:8000/app/web/1/',
    )
    expect(invokePlugin).toHaveBeenCalled()
  })

  it('returns unavailable errors when IPC channel is missing', async () => {
    delete (window as typeof window & { ipcRendererChannel?: unknown })
      .ipcRendererChannel
    delete (globalThis as typeof globalThis & { ipcRendererChannel?: unknown })
      .ipcRendererChannel

    const skillId = ref('website')
    const conversationId = ref('conv-1')
    const api = scope.run(() =>
      useSkillComposerToolbar({ skillId, conversationId }),
    )!

    expect(await api.preview('publish-website')).toMatchObject({
      ok: false,
      error: 'Toolbar plugin unavailable',
    })
    expect(await api.invoke('publish-website')).toMatchObject({
      ok: false,
      error: 'Toolbar plugin unavailable',
    })
  })

  it('clears plugins when skill or conversation is blank', async () => {
    const getPlugins = vi.fn(async () => ({
      ok: true,
      plugins: [
        {
          id: 'publish-website',
          label: 'Publish website',
          icon: 'globe',
          enabled: true,
        },
      ],
    }))
    installIpc({
      GetSkillComposerToolbarPlugins: getPlugins,
      PreviewSkillComposerToolbarPlugin: async () => ({ ok: false }),
      InvokeSkillComposerToolbarPlugin: async () => ({ ok: false }),
    })

    const skillId = ref<string | null>('website')
    const conversationId = ref<string | null>('conv-1')
    const api = scope.run(() =>
      useSkillComposerToolbar({ skillId, conversationId }),
    )!

    await vi.waitFor(() => expect(api.plugins.value).toHaveLength(1))

    skillId.value = null
    await nextTick()
    await vi.waitFor(() => expect(api.plugins.value).toEqual([]))
  })

  it('surfaces refresh IPC rejection instead of silently clearing plugins', async () => {
    const getPlugins = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        plugins: [
          {
            id: 'publish-website',
            label: 'Publish website',
            icon: 'globe',
            enabled: true,
          },
        ],
      })
      .mockRejectedValueOnce(new Error('IPC bridge down'))

    installIpc({
      GetSkillComposerToolbarPlugins: getPlugins,
      PreviewSkillComposerToolbarPlugin: async () => ({ ok: false }),
      InvokeSkillComposerToolbarPlugin: async () => ({ ok: false }),
    })

    const skillId = ref<string | null>('website')
    const conversationId = ref<string | null>('conv-1')
    const api = scope.run(() =>
      useSkillComposerToolbar({ skillId, conversationId }),
    )!

    await vi.waitFor(() => expect(api.plugins.value).toHaveLength(1))
    expect(api.refreshError.value).toBeNull()

    await api.refresh()
    expect(api.plugins.value).toEqual([])
    expect(api.refreshError.value).toBe('IPC bridge down')
  })

  it('surfaces refresh result.ok=false with error message', async () => {
    installIpc({
      GetSkillComposerToolbarPlugins: async () => ({
        ok: false,
        error: 'Skill module failed to load',
        plugins: [],
      }),
      PreviewSkillComposerToolbarPlugin: async () => ({ ok: false }),
      InvokeSkillComposerToolbarPlugin: async () => ({ ok: false }),
    })

    const skillId = ref('website')
    const conversationId = ref('conv-1')
    const api = scope.run(() =>
      useSkillComposerToolbar({ skillId, conversationId }),
    )!

    await vi.waitFor(() =>
      expect(api.refreshError.value).toBe('Skill module failed to load'),
    )
    expect(api.plugins.value).toEqual([])
  })

  it('rejects concurrent invoke of a different plugin while one is running', async () => {
    let resolveFirst: ((value: unknown) => void) | null = null
    const invokePlugin = vi.fn((args: { pluginId: string }) => {
      if (args.pluginId === 'plugin-a') {
        return new Promise((resolve) => {
          resolveFirst = resolve
        })
      }
      return Promise.resolve({ ok: true, message: 'b done' })
    })

    installIpc({
      GetSkillComposerToolbarPlugins: async () => ({
        ok: true,
        plugins: [
          { id: 'plugin-a', label: 'A', icon: 'a', enabled: true },
          { id: 'plugin-b', label: 'B', icon: 'b', enabled: true },
        ],
      }),
      PreviewSkillComposerToolbarPlugin: async () => ({ ok: false }),
      InvokeSkillComposerToolbarPlugin: invokePlugin,
    })

    const skillId = ref('website')
    const conversationId = ref('conv-1')
    const api = scope.run(() =>
      useSkillComposerToolbar({ skillId, conversationId }),
    )!

    await vi.waitFor(() => expect(api.plugins.value).toHaveLength(2))

    const first = api.invoke('plugin-a')
    await vi.waitFor(() => expect(api.invokingId.value).toBe('plugin-a'))

    const second = await api.invoke('plugin-b')
    expect(second).toMatchObject({
      ok: false,
      error: 'Another toolbar action is already running',
    })
    expect(invokePlugin).toHaveBeenCalledTimes(1)

    resolveFirst!({ ok: true, message: 'a done' })
    await expect(first).resolves.toMatchObject({ ok: true, message: 'a done' })
  })
})
