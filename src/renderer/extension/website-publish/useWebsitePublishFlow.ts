import { ref, type Ref } from 'vue'
import type {
  SkillComposerToolbarInvokeResult,
  SkillComposerToolbarPreviewResult,
} from '@shared/agent/skill-composer-toolbar'
import { PUBLISH_WEBSITE_PLUGIN_ID } from './constants'
import type { WebsitePublishDialogPhase } from './WebsitePublishDialog.vue'

export type WebsitePublishToolbarPlugin = {
  id: string
  label: string
  enabled: boolean
  disabledReason?: string
}

export type UseWebsitePublishFlowOptions = {
  preview: (
    pluginId: string,
  ) => Promise<SkillComposerToolbarPreviewResult>
  invoke: (
    pluginId: string,
  ) => Promise<SkillComposerToolbarInvokeResult>
}

export type UseWebsitePublishFlowResult = {
  open: Ref<boolean>
  phase: Ref<WebsitePublishDialogPhase>
  preview: Ref<SkillComposerToolbarPreviewResult | null>
  result: Ref<SkillComposerToolbarInvokeResult | null>
  /** Returns true when this click was handled as website publish. */
  handleToolbarClick: (
    plugin: WebsitePublishToolbarPlugin,
  ) => Promise<boolean>
  confirmPublish: () => Promise<void>
  close: () => void
}

export function useWebsitePublishFlow(
  options: UseWebsitePublishFlowOptions,
): UseWebsitePublishFlowResult {
  const open = ref(false)
  const phase = ref<WebsitePublishDialogPhase>('confirm')
  const preview = ref<SkillComposerToolbarPreviewResult | null>(null)
  const result = ref<SkillComposerToolbarInvokeResult | null>(null)
  const pluginId = ref<string | null>(null)

  function close() {
    if (phase.value === 'publishing') return
    open.value = false
    pluginId.value = null
    preview.value = null
    result.value = null
    phase.value = 'confirm'
  }

  async function handleToolbarClick(
    plugin: WebsitePublishToolbarPlugin,
  ): Promise<boolean> {
    if (plugin.id !== PUBLISH_WEBSITE_PLUGIN_ID) return false

    pluginId.value = plugin.id
    result.value = null
    phase.value = 'confirm'
    const nextPreview = await options.preview(plugin.id)
    preview.value = nextPreview
    if (!nextPreview.ok) {
      result.value = {
        ok: false,
        error:
          nextPreview.error ||
          plugin.disabledReason ||
          'This action is not available right now',
      }
      phase.value = 'result'
    }
    open.value = true
    return true
  }

  async function confirmPublish() {
    const id = pluginId.value
    if (!id || phase.value !== 'confirm') return
    phase.value = 'publishing'
    try {
      const nextResult = await options.invoke(id)
      result.value = nextResult
      phase.value = 'result'
    } catch (err) {
      result.value = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
      phase.value = 'result'
    }
  }

  return {
    open,
    phase,
    preview,
    result,
    handleToolbarClick,
    confirmPublish,
    close,
  }
}
