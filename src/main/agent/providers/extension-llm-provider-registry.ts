import type { ExtensionLlmProviderSummary } from '@shared/agent/extension-contributions'
import type { ProviderAdapter } from './adapters'

export type RegisteredExtensionLlmProvider = {
  extensionId: string
  providerId: string
  label: string
  adapter: ProviderAdapter
  credentialFields: string[]
}

const providers = new Map<string, RegisteredExtensionLlmProvider>()

export function clearExtensionLlmProviders(): void {
  providers.clear()
}

export function registerExtensionLlmProvider(
  registryId: string,
  provider: RegisteredExtensionLlmProvider,
): void {
  providers.set(registryId, provider)
}

export function getExtensionLlmProvider(
  registryId: string,
): RegisteredExtensionLlmProvider | undefined {
  return providers.get(registryId)
}

export function isExtensionLlmProvider(registryId: string): boolean {
  return providers.has(registryId)
}

export function listExtensionLlmProviders(): ExtensionLlmProviderSummary[] {
  return [...providers.entries()].map(([registryId, provider]) => ({
    extensionId: provider.extensionId,
    providerId: provider.providerId,
    registryId,
    label: provider.label,
    credentialFields: provider.credentialFields,
  }))
}
