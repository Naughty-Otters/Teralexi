import { describe, expect, it, vi } from 'vitest'

vi.mock('./conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    listMcpServers: vi.fn(() => []),
  })),
}))

import { getMcpServerManager } from './mcp-server-manager'

describe('mcp-server-manager', () => {
  it('returns singleton manager', () => {
    expect(getMcpServerManager()).toBe(getMcpServerManager())
  })
})
