import { beforeEach, describe, expect, it, vi } from 'vitest'

const { registerMock, registerExtensionLlmProviderMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  registerExtensionLlmProviderMock: vi.fn(),
}))

vi.mock('@main/channels/framework/channel-registry', () => ({
  getChannelRegistry: () => ({ register: registerMock }),
}))

vi.mock('@main/agent/providers/extension-llm-provider-registry', () => ({
  clearExtensionLlmProviders: vi.fn(),
  registerExtensionLlmProvider: registerExtensionLlmProviderMock,
  listExtensionLlmProviders: vi.fn(() => []),
}))

import {
  clearExtensionContributions,
  registerExtensionContributions,
} from './extension-contributions-registry'

describe('extension-contributions-registry', () => {
  beforeEach(() => {
    clearExtensionContributions()
    registerMock.mockReset()
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
  })

  it('skips invalid llm provider contributions', () => {
    registerExtensionContributions({
      extensionId: 'demo-ext',
      extensionDir: '/tmp/demo-ext',
      llmProviders: {
        broken: { label: 'Broken', adapter: {} },
      },
    })
    expect(registerExtensionLlmProviderMock).not.toHaveBeenCalled()
  })
})
