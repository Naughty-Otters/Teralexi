import { ensureExtensionHostInitialized } from '@main/skills/extension-host'
import { ensureBuiltinChannelManagersStarted } from './channel-lifecycle'

/** Extension channels register as `extensionId:channelId`. */
function isExtensionScopedChannelId(channelId: string): boolean {
  const trimmed = channelId.trim()
  if (!trimmed.includes(':')) return false
  const [extensionId, localId] = trimmed.split(':', 2)
  return Boolean(extensionId?.trim() && localId?.trim())
}

/**
 * Ensure senders for a channel id are registered before scheduler delivery or IPC send.
 */
export async function ensureChannelSenderReady(
  userId: string,
  channelId: string,
  workspacePath?: string,
): Promise<void> {
  const id = channelId.trim()
  if (!id) return
  if (isExtensionScopedChannelId(id)) {
    await ensureExtensionHostInitialized(userId, workspacePath)
    return
  }
  await ensureBuiltinChannelManagersStarted()
}
