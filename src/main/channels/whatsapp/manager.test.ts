import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))
vi.mock('fs/promises', () => ({ mkdir: vi.fn(), rm: vi.fn() }))
vi.mock('@config/openfde-home', () => ({
  getopenfdeWhatsAppAuthDir: vi.fn(() => '/wa-auth'),
}))
vi.mock('@config/system-prop', () => ({
  getSystemPropValue: vi.fn((_k: string, def?: string) => def ?? ''),
  setSystemPropValue: vi.fn(),
}))
vi.mock('@main/channels/framework/channel-registry', () => ({
  getChannelRegistry: vi.fn(() => ({ register: vi.fn() })),
}))
vi.mock('@main/channels/framework/conversation-bridge', () => ({
  getChannelConversationBridge: vi.fn(() => ({
    onIncomingMessage: vi.fn(),
  })),
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,x') },
}))

vi.mock('@whiskeysockets/baileys', () => ({
  default: vi.fn(),
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: vi.fn(async () => ({ version: [1] })),
  useMultiFileAuthState: vi.fn(async () => ({
    state: {},
    saveCreds: vi.fn(),
  })),
}))

import {
  getWhatsAppChannelManager,
  getWhatsAppDisconnectStatusCode,
  isWhatsAppConflictDisconnect,
} from './manager'

describe('whatsapp manager', () => {
  it('returns singleton with default state', () => {
    const mgr = getWhatsAppChannelManager()
    expect(getWhatsAppChannelManager()).toBe(mgr)
    const state = mgr.getState()
    expect(state.status).toBeDefined()
    expect(state.botName).toBeTruthy()
  })

  it('detects session conflict from status code 440', () => {
    expect(
      isWhatsAppConflictDisconnect({
        output: { statusCode: 440 },
      }),
    ).toBe(true)
    expect(getWhatsAppDisconnectStatusCode({ output: { statusCode: 440 } })).toBe(
      440,
    )
  })

  it('detects session conflict from baileys stream error payload', () => {
    expect(
      isWhatsAppConflictDisconnect({
        message: 'Stream Errored',
        data: {
          tag: 'stream:error',
          content: [{ tag: 'conflict', attrs: { type: 'replaced' } }],
        },
      }),
    ).toBe(true)
  })

  it('does not treat unrelated disconnects as conflict', () => {
    expect(
      isWhatsAppConflictDisconnect({
        output: { statusCode: 401 },
      }),
    ).toBe(false)
    expect(
      isWhatsAppConflictDisconnect(new Error('connection closed')),
    ).toBe(false)
  })
})
