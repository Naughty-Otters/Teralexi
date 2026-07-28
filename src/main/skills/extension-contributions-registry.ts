import {
  extensionContributionRegistryId,
  type ExtensionChannelSummary,
  type ExtensionUiPanelSummary,
} from '@shared/agent/extension-contributions'
import type {
  ExtensionChannelSender,
  LlmProviderContribution,
  UiPanelContribution,
} from '@teralexi/skill-sdk'
import { getChannelRegistry } from '@main/channels/framework/channel-registry'
import { createLogger } from '@main/logger'
import type { ProviderAdapter } from '@main/agent/providers/adapters'
import {
  clearExtensionLlmProviders,
  listExtensionLlmProviders,
  registerExtensionLlmProvider,
} from '@main/agent/providers/extension-llm-provider-registry'

const log = createLogger('skills.extension-contributions')

export type ExtensionContributionRegistration = {
  extensionId: string
  extensionDir: string
  channels?: Record<string, ExtensionChannelSender>
  llmProviders?: Record<string, LlmProviderContribution>
  uiPanels?: Record<string, UiPanelContribution>
}

type RegisteredUiPanel = ExtensionUiPanelSummary & {
  extensionDir: string
}

const registeredChannels = new Map<string, ExtensionChannelSummary>()
const registeredUiPanels = new Map<string, RegisteredUiPanel>()

function isChannelSender(value: unknown): value is ExtensionChannelSender {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ExtensionChannelSender).sendToTarget === 'function'
  )
}

function isProviderAdapter(value: unknown): value is ProviderAdapter {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ProviderAdapter).createModel === 'function'
  )
}

function registerChannels(
  extensionId: string,
  channels: Record<string, ExtensionChannelSender>,
): void {
  const registry = getChannelRegistry()
  for (const [channelId, sender] of Object.entries(channels)) {
    if (!isChannelSender(sender)) {
      log.warn('Skipping invalid channel contribution', { extensionId, channelId })
      continue
    }
    const registryId = extensionContributionRegistryId(extensionId, channelId)
    registry.register(registryId, sender)
    registeredChannels.set(registryId, { extensionId, channelId, registryId })
  }
}

function registerLlmProviders(
  extensionId: string,
  providers: Record<string, LlmProviderContribution>,
): void {
  for (const [providerId, contribution] of Object.entries(providers)) {
    if (!contribution || typeof contribution !== 'object') continue
    if (!isProviderAdapter(contribution.adapter)) {
      log.warn('Skipping invalid llm provider contribution', { extensionId, providerId })
      continue
    }
    const registryId = extensionContributionRegistryId(extensionId, providerId)
    registerExtensionLlmProvider(registryId, {
      extensionId,
      providerId,
      label: contribution.label?.trim() || providerId,
      adapter: contribution.adapter,
      credentialFields: Array.isArray(contribution.credentialFields)
        ? contribution.credentialFields.map(String)
        : [],
    })
  }
}

function registerUiPanels(
  extensionId: string,
  extensionDir: string,
  panels: Record<string, UiPanelContribution>,
): void {
  for (const [panelId, contribution] of Object.entries(panels)) {
    if (!contribution || typeof contribution !== 'object') continue
    const label = contribution.label?.trim()
    const component = contribution.component?.trim()
    if (!label || !component) {
      log.warn('Skipping invalid ui panel contribution', { extensionId, panelId })
      continue
    }
    const registryId = extensionContributionRegistryId(extensionId, panelId)
    registeredUiPanels.set(registryId, {
      extensionId,
      panelId,
      registryId,
      label,
      component,
      extensionDir,
    })
  }
}

export function clearExtensionContributions(): void {
  const registry = getChannelRegistry()
  for (const registryId of registeredChannels.keys()) {
    registry.unregister(registryId)
  }
  registeredChannels.clear()
  registeredUiPanels.clear()
  clearExtensionLlmProviders()
}

export function registerExtensionContributions(
  registration: ExtensionContributionRegistration,
): void {
  const { extensionId, extensionDir, channels, llmProviders, uiPanels } = registration
  if (channels && Object.keys(channels).length > 0) {
    registerChannels(extensionId, channels)
  }
  if (llmProviders && Object.keys(llmProviders).length > 0) {
    registerLlmProviders(extensionId, llmProviders)
  }
  if (uiPanels && Object.keys(uiPanels).length > 0) {
    registerUiPanels(extensionId, extensionDir, uiPanels)
  }
}

export function listExtensionChannelSummaries(): ExtensionChannelSummary[] {
  return [...registeredChannels.values()]
}

export function listExtensionUiPanelSummaries(): ExtensionUiPanelSummary[] {
  return [...registeredUiPanels.values()].map(
    ({ extensionDir: _dir, ...summary }) => summary,
  )
}

export function getExtensionUiPanel(
  registryId: string,
): RegisteredUiPanel | undefined {
  return registeredUiPanels.get(registryId)
}

export { listExtensionLlmProviders }
