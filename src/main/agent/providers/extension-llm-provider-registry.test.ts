import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearExtensionLlmProviders,
  getExtensionLlmProvider,
  isExtensionLlmProvider,
  listExtensionLlmProviders,
  registerExtensionLlmProvider,
} from './extension-llm-provider-registry'

describe('extension-llm-provider-registry', () => {
  beforeEach(() => {
    clearExtensionLlmProviders()
  })

  it('registers and lists extension llm providers', () => {
    registerExtensionLlmProvider('demo-ext:local', {
      extensionId: 'demo-ext',
      providerId: 'local',
      label: 'Demo LLM',
      adapter: { createModel: () => ({}) },
      credentialFields: ['apiKey'],
    })

    expect(isExtensionLlmProvider('demo-ext:local')).toBe(true)
    expect(getExtensionLlmProvider('demo-ext:local')).toMatchObject({
      label: 'Demo LLM',
      credentialFields: ['apiKey'],
    })
    expect(listExtensionLlmProviders()).toEqual([
      {
        extensionId: 'demo-ext',
        providerId: 'local',
        registryId: 'demo-ext:local',
        label: 'Demo LLM',
        credentialFields: ['apiKey'],
      },
    ])
  })

  it('clears registered providers', () => {
    registerExtensionLlmProvider('demo-ext:local', {
      extensionId: 'demo-ext',
      providerId: 'local',
      label: 'Demo LLM',
      adapter: { createModel: () => ({}) },
      credentialFields: [],
    })

    clearExtensionLlmProviders()

    expect(isExtensionLlmProvider('demo-ext:local')).toBe(false)
    expect(listExtensionLlmProviders()).toEqual([])
  })
})
