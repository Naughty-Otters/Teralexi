import { getConversationStore } from '@main/services/conversation-store'
import type { ExtensionManifest } from '@teralexi/skill-sdk'
import { listExtensions, type ExtensionSource } from './extensions-directory-loader'
import { listPendingHookReviews } from './extension-host'

export type { ExtensionSource }

export type ExtensionSummary = {
  id: string
  version: string
  permissions?: ExtensionManifest['permissions']
  activationEvents?: ExtensionManifest['activationEvents']
  hookEvents: string[]
  enabled: boolean
  source: ExtensionSource
  pendingHookReviews: number
}

/**
 * Disk-discovered extension manifests (`listExtensions()`) merged with the
 * per-user enable/disable override stored in `extension_settings`.
 */
export async function listExtensionsForUser(
  userId: string,
  workspacePath?: string,
): Promise<ExtensionSummary[]> {
  const store = getConversationStore()
  const pending = await listPendingHookReviews(userId, workspacePath)
  const pendingByExtension = new Map<string, number>()
  for (const review of pending) {
    pendingByExtension.set(
      review.extensionId,
      (pendingByExtension.get(review.extensionId) ?? 0) + 1,
    )
  }

  return listExtensions(workspacePath).map((ext) => ({
    id: ext.id,
    version: ext.manifest.version,
    permissions: ext.manifest.permissions,
    activationEvents: ext.manifest.activationEvents,
    hookEvents: Object.keys(ext.manifest.contributes?.hooks ?? {}),
    enabled: store.getExtensionEnabled(userId, ext.id),
    source: ext.source,
    pendingHookReviews: pendingByExtension.get(ext.id) ?? 0,
  }))
}
