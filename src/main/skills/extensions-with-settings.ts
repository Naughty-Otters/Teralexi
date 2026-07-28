import { getConversationStore } from '@main/services/conversation-store'
import type { ExtensionManifest } from '@teralexi/skill-sdk'
import { listExtensions, type ExtensionSource } from './extensions-directory-loader'
import {
  ensureExtensionHostInitialized,
  peekPendingHookReviews,
} from './extension-host'
import { createLogger } from '@main/logger'

const log = createLogger('skills.extensions-with-settings')

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
 *
 * Intentionally does **not** await the extension host rebuild (esbuild of
 * actions modules). Pending review counts come from cache when available;
 * otherwise a background host init is kicked off so a later refresh sees them.
 */
export async function listExtensionsForUser(
  userId: string,
  workspacePath?: string,
): Promise<ExtensionSummary[]> {
  const store = getConversationStore()
  const pendingByExtension = new Map<string, number>()

  const cachedPending = peekPendingHookReviews(userId, workspacePath)
  if (cachedPending) {
    for (const review of cachedPending) {
      pendingByExtension.set(
        review.extensionId,
        (pendingByExtension.get(review.extensionId) ?? 0) + 1,
      )
    }
  } else {
    void ensureExtensionHostInitialized(userId, workspacePath).catch((err) => {
      log.warn('Background extension host init failed after list', { err })
    })
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
