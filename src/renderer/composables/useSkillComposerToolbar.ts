import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import type {
  SkillComposerToolbarInvokeResult,
  SkillComposerToolbarPluginView,
  SkillComposerToolbarPreviewResult,
} from '@shared/agent/skill-composer-toolbar'

/**
 * Loads + invokes skill-owned composer toolbar plugins for the active skill.
 */
export function useSkillComposerToolbar(opts: {
  skillId: Ref<string | null | undefined>
  conversationId: Ref<string | null | undefined>
}) {
  const plugins = ref<SkillComposerToolbarPluginView[]>([])
  const invokingId = ref<string | null>(null)
  const refreshError = ref<string | null>(null)
  const lastResult = ref<SkillComposerToolbarInvokeResult | null>(null)
  const lastPreview = ref<SkillComposerToolbarPreviewResult | null>(null)

  const visiblePlugins = computed(() => plugins.value)

  async function refresh(): Promise<void> {
    const skillId = opts.skillId.value?.trim()
    const conversationId = opts.conversationId.value?.trim()
    const ch = window.ipcRendererChannel?.GetSkillComposerToolbarPlugins
    if (!skillId || !conversationId || !ch?.invoke) {
      plugins.value = []
      refreshError.value = null
      return
    }
    try {
      const result = await ch.invoke({ skillId, conversationId })
      if (
        opts.skillId.value?.trim() !== skillId ||
        opts.conversationId.value?.trim() !== conversationId
      ) {
        return
      }
      if (result.ok && Array.isArray(result.plugins)) {
        plugins.value = result.plugins
        refreshError.value = null
        return
      }
      plugins.value = []
      refreshError.value =
        !result.ok && 'error' in result && typeof result.error === 'string'
          ? result.error
          : 'Failed to load toolbar actions'
    } catch (err) {
      plugins.value = []
      refreshError.value =
        err instanceof Error ? err.message : String(err)
    }
  }

  async function preview(
    pluginId: string,
  ): Promise<SkillComposerToolbarPreviewResult> {
    const skillId = opts.skillId.value?.trim()
    const conversationId = opts.conversationId.value?.trim()
    const ch = window.ipcRendererChannel?.PreviewSkillComposerToolbarPlugin
    if (!skillId || !conversationId || !ch?.invoke) {
      const fail = { ok: false as const, error: 'Toolbar plugin unavailable' }
      lastPreview.value = fail
      return fail
    }
    try {
      const result = await ch.invoke({ skillId, conversationId, pluginId })
      lastPreview.value = result
      return result
    } catch (err) {
      const fail = {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }
      lastPreview.value = fail
      return fail
    }
  }

  async function invoke(
    pluginId: string,
  ): Promise<SkillComposerToolbarInvokeResult> {
    const skillId = opts.skillId.value?.trim()
    const conversationId = opts.conversationId.value?.trim()
    const ch = window.ipcRendererChannel?.InvokeSkillComposerToolbarPlugin
    if (!skillId || !conversationId || !ch?.invoke) {
      const fail = { ok: false as const, error: 'Toolbar plugin unavailable' }
      lastResult.value = fail
      return fail
    }
    if (invokingId.value) {
      const fail = {
        ok: false as const,
        error: 'Another toolbar action is already running',
      }
      lastResult.value = fail
      return fail
    }
    invokingId.value = pluginId
    try {
      const result = await ch.invoke({ skillId, conversationId, pluginId })
      lastResult.value = result
      await refresh()
      return result
    } catch (err) {
      const fail = {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }
      lastResult.value = fail
      return fail
    } finally {
      invokingId.value = null
    }
  }

  watch(
    [opts.skillId, opts.conversationId],
    () => {
      void refresh()
    },
    { immediate: true },
  )

  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void refresh()
    }, 400)
  }

  function onConversationScopedEvent(
    _event: unknown,
    payload?: { conversationId?: string },
  ): void {
    const active = opts.conversationId.value?.trim()
    const eventCid = payload?.conversationId?.trim()
    if (active && eventCid && active !== eventCid) return
    scheduleRefresh()
  }

  function onEntitlementChanged(): void {
    scheduleRefresh()
  }

  onMounted(() => {
    window.ipcRendererChannel?.AgentStreamFinished?.on?.(
      onConversationScopedEvent,
    )
    window.ipcRendererChannel?.WorkspaceFilesChanged?.on?.(
      onConversationScopedEvent,
    )
    window.ipcRendererChannel?.EntitlementChanged?.on?.(onEntitlementChanged)
  })

  onUnmounted(() => {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    window.ipcRendererChannel?.AgentStreamFinished?.removeListener?.(
      onConversationScopedEvent,
    )
    window.ipcRendererChannel?.WorkspaceFilesChanged?.removeListener?.(
      onConversationScopedEvent,
    )
    window.ipcRendererChannel?.EntitlementChanged?.removeListener?.(
      onEntitlementChanged,
    )
  })

  return {
    plugins: visiblePlugins,
    invokingId,
    refreshError,
    lastResult,
    lastPreview,
    refresh,
    preview,
    invoke,
  }
}
