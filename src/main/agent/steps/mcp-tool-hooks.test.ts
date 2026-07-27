import { describe, expect, it, vi, beforeEach } from 'vitest'

const { getMcpServerMock, callToolMock } = vi.hoisted(() => ({
  getMcpServerMock: vi.fn(() => ({ id: 'srv1', enabled: true })),
  callToolMock: vi.fn(async () => ({ ok: true })),
}))

// Same mock set step-helpers.test.ts uses to avoid Electron/SQLite/config I/O.
vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({ getMcpServer: getMcpServerMock }),
}))

vi.mock('@main/services/mcp-server-manager', () => ({
  getMcpServerManager: () => ({ callTool: callToolMock }),
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValue: (_key: string, fallback: string) => fallback,
  getSystemPropValues: () => ({}),
}))

vi.mock('../utils/chat-context-settings', () => ({
  loadChatUiReasoningMaxChars: () => 12_000,
  loadChatContextWindowMessages: () => 40,
}))

vi.mock('../llm/llm-debug-writer', () => ({
  scheduleLlmDebugRequest: vi.fn(() => null),
  scheduleLlmDebugResponse: vi.fn(),
}))

vi.mock('../tool-approval-secret', () => ({
  getToolApprovalSecret: () => 'test-tool-approval-secret-32chars!!',
}))

vi.mock('../llm/runtime', () => ({
  runAgentStream: vi.fn(),
}))

vi.mock('../hooks/user-hooks', () => ({
  runUserHooks: vi.fn(async () => ({ blocked: false })),
}))

import { callMcpToolDirect } from './step-helpers'
import { runUserHooks } from '../hooks/user-hooks'

const runUserHooksMock = vi.mocked(runUserHooks)

describe('callMcpToolDirect hooks', () => {
  beforeEach(() => {
    runUserHooksMock.mockReset()
    runUserHooksMock.mockResolvedValue({ blocked: false })
    getMcpServerMock.mockReset().mockReturnValue({ id: 'srv1', enabled: true })
    callToolMock.mockReset().mockResolvedValue({ ok: true })
  })

  it('dispatches PreMcpToolUse before and PostMcpToolUse after a successful call', async () => {
    const result = await callMcpToolDirect('user1', 'srv1', 'search', { q: 'x' })

    expect(result).toEqual({ ok: true })
    expect(runUserHooksMock).toHaveBeenCalledTimes(2)
    expect(runUserHooksMock.mock.calls[0][0]).toMatchObject({
      event: 'PreMcpToolUse',
      toolName: 'search',
      toolInput: { q: 'x' },
    })
    expect(runUserHooksMock.mock.calls[1][0]).toMatchObject({
      event: 'PostMcpToolUse',
      toolName: 'search',
      toolInput: { q: 'x' },
      toolResult: { ok: true },
    })
  })

  it('blocks the call and never reaches the MCP server when PreMcpToolUse is blocked', async () => {
    runUserHooksMock.mockResolvedValueOnce({
      blocked: true,
      message: 'denied by policy',
    })

    const result = await callMcpToolDirect('user1', 'srv1', 'search', { q: 'x' })

    expect(result).toEqual({ error: 'denied by policy' })
    expect(runUserHooksMock).toHaveBeenCalledTimes(1)
    expect(getMcpServerMock).not.toHaveBeenCalled()
    expect(callToolMock).not.toHaveBeenCalled()
  })

  it('still dispatches PostMcpToolUse when the underlying MCP call throws', async () => {
    callToolMock.mockRejectedValueOnce(new Error('server unreachable'))

    await expect(
      callMcpToolDirect('user1', 'srv1', 'search', { q: 'x' }),
    ).rejects.toThrow('server unreachable')

    expect(runUserHooksMock).toHaveBeenCalledTimes(2)
    expect(runUserHooksMock.mock.calls[1][0]).toMatchObject({
      event: 'PostMcpToolUse',
      hasError: true,
    })
  })
})
