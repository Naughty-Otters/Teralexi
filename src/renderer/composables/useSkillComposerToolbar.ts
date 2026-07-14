import { computed, ref, watch, type Ref } from 'vue'
import type {
  SkillComposerToolbarInvokeResult,
  SkillComposerToolbarPluginView,
} from '@shared/agent/skill-composer-toolbar'

/**
 * Loads + invokes skill-owned composer toolbar plugins for the active skill.
 */
export function useSkillComposerToolbar(opts: {
  skillId: Ref<string | null | undefined>
  conversationId: Ref<string | null | undefined>
  /** When true, buttons stay visible but cannot be clicked. */
  interactionDisabled: Ref<boolean>
}) {
  const plugins = ref<SkillComposerToolbarPluginView[]>([])
  const invokingId = ref<string | null>(null)
  const lastResult = ref<SkillComposerToolbarInvokeResult | null>(null)

  const visiblePlugins = computed(() => plugins.value)

  async function refresh(): Promise<void> {
    const skillId = opts.skillId.value?.trim()
    const conversationId = opts.conversationId.value?.trim()
    const ch = window.ipcRendererChannel?.GetSkillComposerToolbarPlugins
    if (!skillId || !conversationId || !ch?.invoke) {
      plugins.value = []
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
      plugins.value = result.ok && Array.isArray(result.plugins) ? result.plugins : []
    } catch {
      plugins.value = []
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
    if (opts.interactionDisabled.value) {
      const fail = { ok: false as const, error: 'Wait for the current turn to finish' }
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

  watch(opts.interactionDisabled, (disabled, wasDisabled) => {
    if (wasDisabled && !disabled) void refresh()
  })

  return {
    plugins: visiblePlugins,
    invokingId,
    lastResult,
    refresh,
    invoke,
  }
}
