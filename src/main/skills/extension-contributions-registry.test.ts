import { beforeEach, describe, expect, it, vi } from 'vitest'

const { registerMock, unregisterMock, registerExtensionLlmProviderMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  unregisterMock: vi.fn(),
  registerExtensionLlmProviderMock: vi.fn(),
}))

vi.mock('@main/channels/framework/channel-registry', () => ({
  getChannelRegistry: () => ({ register: registerMock, unregister: unregisterMock }),
}))

vi.mock('@main/agent/providers/extension-llm-provider-registry', () => ({
  clearExtensionLlmProviders: vi.fn(),
  registerExtensionLlmProvider: registerExtensionLlmProviderMock,
  listExtensionLlmProviders: vi.fn(() => []),
}))

import {
  clearExtensionContributions,
  getExtensionUiPanel,
  listExtensionChannelSummaries,
  listExtensionUiPanelSummaries,
  registerExtensionContributions,
} from './extension-contributions-registry'

describe('extension-contributions-registry', () => {
  beforeEach(() => {
    clearExtensionContributions()
    registerMock.mockReset()
    unregisterMock.mockReset()
    registerExtensionLlmProviderMock.mockReset()
  })

  it('registers channels under extension-scoped ids', () => {
    registerExtensionContributions({
      extensionId: 'demo-ext',
      extensionDir: '/tmp/demo-ext',
      channels: {
        matrix: {
          sendToTarget: vi.fn(async () => undefined),
        },
      },
    })

    expect(registerMock).toHaveBeenCalledWith(
      'demo-ext:matrix',
      expect.objectContaining({ sendToTarget: expect.any(Function) }),
    )
    expect(listExtensionChannelSummaries()).toEqual([
      {
        extensionId: 'demo-ext',
        channelId: 'matrix',
        registryId: 'demo-ext:matrix',
      },
    ])
  })

  it('skips invalid channel and llm provider contributions', () => {
    registerExtensionContributions({
      extensionId: 'demo-ext',
      extensionDir: '/tmp/demo-ext',
      channels: {
        broken: { sendToTarget: 'nope' },
      },
      llmProviders: {
        broken: { label: 'Broken', adapter: {} },
      },
      uiPanels: {
        broken: { label: '', component: '' },
      },
    })

    expect(registerMock).not.toHaveBeenCalled()
    expect(registerExtensionLlmProviderMock).not.toHaveBeenCalled()
    expect(listExtensionChannelSummaries()).toEqual([])
    expect(listExtensionUiPanelSummaries()).toEqual([])
  })

  it('registers valid llm providers and ui panels', () => {
    registerExtensionContributions({
      extensionId: 'demo-ext',
      extensionDir: '/tmp/demo-ext',
      llmProviders: {
        local: {
          label: ' Local ',
          adapter: { createModel: () => ({}) },
          credentialFields: ['apiKey'],
        },
      },
      uiPanels: {
        settings: {
          label: ' Settings ',
          component: ' ./Settings.vue ',
        },
      },
    })

    expect(registerExtensionLlmProviderMock).toHaveBeenCalledWith(
      'demo-ext:local',
      expect.objectContaining({
        label: 'Local',
        credentialFields: ['apiKey'],
      }),
    )
    expect(listExtensionUiPanelSummaries()).toEqual([
      {
        extensionId: 'demo-ext',
        panelId: 'settings',
        registryId: 'demo-ext:settings',
        label: 'Settings',
        component: './Settings.vue',
      },
    ])
    expect(getExtensionUiPanel('demo-ext:settings')).toMatchObject({
      extensionDir: '/tmp/demo-ext',
      component: './Settings.vue',
    })
  })

  it('unregisters channels when contributions are cleared', () => {
    registerExtensionContributions({
      extensionId: 'demo-ext',
      extensionDir: '/tmp/demo-ext',
      channels: {
        matrix: {
          sendToTarget: vi.fn(async () => undefined),
        },
      },
    })

    clearExtensionContributions()
    expect(unregisterMock).toHaveBeenCalledWith('demo-ext:matrix')
    expect(listExtensionChannelSummaries()).toEqual([])
  })
})
