import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  cycleChatBoxDisplayMode,
  isChatBoxDisplayMode,
  readChatBoxDisplayModeInitial,
  resolveUiChatBoxDisplayMode,
  isUiChatBoxDisplayModeToggleEnabled,
  usesStructuredAssistantRendering,
  ASSISTANT_STRUCTURED_DEBUG_STORAGE_KEY,
  CHAT_BOX_DISPLAY_MODE_STORAGE_KEY,
} from './chatBoxDisplayMode'

describe('chatBoxDisplayMode', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('recognizes valid modes', () => {
    expect(isChatBoxDisplayMode('brief')).toBe(true)
    expect(isChatBoxDisplayMode('timeline')).toBe(true)
    expect(isChatBoxDisplayMode('conversation')).toBe(true)
    expect(isChatBoxDisplayMode('debug')).toBe(false)
  })

  it('cycles brief → timeline → conversation → brief', () => {
    expect(cycleChatBoxDisplayMode('brief')).toBe('timeline')
    expect(cycleChatBoxDisplayMode('timeline')).toBe('conversation')
    expect(cycleChatBoxDisplayMode('conversation')).toBe('brief')
  })

  it('migrates legacy debug storage', () => {
    vi.mocked(localStorage.getItem).mockImplementation((key: string) => {
      if (key === CHAT_BOX_DISPLAY_MODE_STORAGE_KEY) return null
      if (key === ASSISTANT_STRUCTURED_DEBUG_STORAGE_KEY) return '1'
      return null
    })
    expect(readChatBoxDisplayModeInitial()).toBe('timeline')
  })

  it('uses brief when legacy debug is off', () => {
    vi.mocked(localStorage.getItem).mockImplementation((key: string) => {
      if (key === ASSISTANT_STRUCTURED_DEBUG_STORAGE_KEY) return '0'
      return null
    })
    expect(readChatBoxDisplayModeInitial()).toBe('brief')
  })

  it('structured rendering applies to timeline and conversation', () => {
    expect(usesStructuredAssistantRendering('brief')).toBe(false)
    expect(usesStructuredAssistantRendering('timeline')).toBe(true)
    expect(usesStructuredAssistantRendering('conversation')).toBe(true)
  })

  it('locks UI to conversation mode when UI_CHAT_CONVERSATION_MODE_ONLY', () => {
    expect(resolveUiChatBoxDisplayMode()).toBe('conversation')
    expect(isUiChatBoxDisplayModeToggleEnabled()).toBe(false)
  })
})
