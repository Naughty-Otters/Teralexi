import { DEFAULT_USER_ID } from './config'
import type { AgentStoreContext } from './agent-store-context'
import type { ExtensionSummary } from './types'

export type PendingHookReview = {
  extensionId: string
  trustKey: string
  contentHash: string
  sourcePath: string
  events: string[]
  status: 'pending' | 'trusted' | 'rejected'
}

export function createExtensionActions(ctx: AgentStoreContext) {
  const { extensions } = ctx

  async function loadExtensions(): Promise<void> {
    const channel = window.ipcRendererChannel?.ListExtensions
    if (!channel?.invoke) {
      extensions.value = []
      return
    }

    const list = (await channel.invoke({
      userId: DEFAULT_USER_ID,
    })) as ExtensionSummary[]

    extensions.value = Array.isArray(list) ? list : []
  }

  async function toggleExtensionEnabled(extensionId: string): Promise<void> {
    const target = extensions.value.find((ext) => ext.id === extensionId)
    if (!target) return

    const enabled = !target.enabled
    const channel = window.ipcRendererChannel?.SetExtensionEnabled
    if (!channel?.invoke) return

    await channel.invoke({
      userId: DEFAULT_USER_ID,
      extensionId,
      enabled,
    })

    target.enabled = enabled
    await loadExtensions()
    window.dispatchEvent(new CustomEvent('teralexi:extension-contributions-changed'))
  }

  async function listPendingHookReviews(): Promise<PendingHookReview[]> {
    const channel = window.ipcRendererChannel?.ListPendingHookReviews
    if (!channel?.invoke) return []
    const list = (await channel.invoke({ userId: DEFAULT_USER_ID })) as
      | PendingHookReview[]
      | undefined
    return Array.isArray(list) ? list : []
  }

  async function setHookTrustStatus(
    review: PendingHookReview,
    status: 'trusted' | 'rejected',
  ): Promise<void> {
    const channel = window.ipcRendererChannel?.SetHookTrustStatus
    if (!channel?.invoke) return
    await channel.invoke({
      userId: DEFAULT_USER_ID,
      trustKey: review.trustKey,
      contentHash: review.contentHash,
      status,
    })
    await loadExtensions()
    window.dispatchEvent(new CustomEvent('teralexi:extension-contributions-changed'))
  }

  return {
    loadExtensions,
    toggleExtensionEnabled,
    listPendingHookReviews,
    setHookTrustStatus,
  }
}

export function loadExtensions(ctx: AgentStoreContext): Promise<void> {
  return createExtensionActions(ctx).loadExtensions()
}
