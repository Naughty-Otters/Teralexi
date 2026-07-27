/** Serializable extension contribution metadata exposed over IPC. */

export type ExtensionChannelSummary = {
  extensionId: string
  channelId: string
  /** Fully qualified id registered in ChannelRegistry (`extensionId:channelId`). */
  registryId: string
}

export type ExtensionLlmProviderSummary = {
  extensionId: string
  providerId: string
  /** Fully qualified provider id (`extensionId:providerId`). */
  registryId: string
  label: string
  credentialFields: string[]
}

export type ExtensionUiPanelSummary = {
  extensionId: string
  panelId: string
  /** Stable key for settings routing (`extensionId:panelId`). */
  registryId: string
  label: string
  /** Relative path under the extension directory (renderer resolves when bundled). */
  component: string
}

export function extensionContributionRegistryId(
  extensionId: string,
  localId: string,
): string {
  return `${extensionId}:${localId}`
}
