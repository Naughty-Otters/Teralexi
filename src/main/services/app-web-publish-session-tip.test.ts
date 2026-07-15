import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getConversationMock,
  saveMessageMock,
  notifyConversationStoreChangedMock,
} = vi.hoisted(() => ({
  getConversationMock: vi.fn(),
  saveMessageMock: vi.fn(),
  notifyConversationStoreChangedMock: vi.fn(),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getConversation: getConversationMock,
    saveMessage: saveMessageMock,
  }),
}))

vi.mock('@main/services/conversation-store-notify', () => ({
  notifyConversationStoreChanged: notifyConversationStoreChangedMock,
}))

vi.mock('@shared/utils/short-uuid', () => ({
  randomShortUuid: () => 'tip-msg-1',
}))

import {
  appendWebsitePublishedSessionTip,
  formatWebsitePublishedSessionTip,
} from './app-web-publish-session-tip'

describe('formatWebsitePublishedSessionTip', () => {
  it('is just the trimmed public URL', () => {
    expect(
      formatWebsitePublishedSessionTip('  https://example.test/app/web/9/  '),
    ).toBe('https://example.test/app/web/9/')
  })
})

describe('appendWebsitePublishedSessionTip', () => {
  beforeEach(() => {
    getConversationMock.mockReset()
    saveMessageMock.mockReset()
    notifyConversationStoreChangedMock.mockReset()
  })

  it('persists an assistant tip with only the URL and notifies the renderer', () => {
    getConversationMock.mockReturnValue({
      id: 'conv-1',
      agentId: 'agent-1',
    })

    const result = appendWebsitePublishedSessionTip({
      conversationId: 'conv-1',
      absoluteUrl: 'https://example.test/app/web/1/',
    })

    expect(result).toEqual({ ok: true, messageId: 'tip-msg-1' })
    expect(saveMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tip-msg-1',
        conversationId: 'conv-1',
        agentId: 'agent-1',
        role: 'assistant',
        content: 'https://example.test/app/web/1/',
      }),
    )
    expect(notifyConversationStoreChangedMock).toHaveBeenCalledWith(
      'conv-1',
      'agent-1',
    )
  })

  it('fails when conversation id is blank', () => {
    const result = appendWebsitePublishedSessionTip({
      conversationId: '  ',
      absoluteUrl: 'https://example.test/',
    })
    expect(result.ok).toBe(false)
    expect(saveMessageMock).not.toHaveBeenCalled()
  })

  it('fails when the conversation is missing', () => {
    getConversationMock.mockReturnValue(null)
    const result = appendWebsitePublishedSessionTip({
      conversationId: 'missing',
      absoluteUrl: 'https://example.test/',
    })
    expect(result.ok).toBe(false)
    expect(saveMessageMock).not.toHaveBeenCalled()
    expect(notifyConversationStoreChangedMock).not.toHaveBeenCalled()
  })

  it('fails on blank url', () => {
    const result = appendWebsitePublishedSessionTip({
      conversationId: 'conv-1',
      absoluteUrl: '  ',
    })
    expect(result.ok).toBe(false)
    expect(saveMessageMock).not.toHaveBeenCalled()
  })
})
