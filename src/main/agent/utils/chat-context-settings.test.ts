import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@config/system-prop', () => ({
  getSystemPropValues: vi.fn(() => ({})),
}))

import { getSystemPropValues } from '@config/system-prop'
import { loadChatContextWindowMessages } from './chat-context-settings'

describe('loadChatContextWindowMessages', () => {
  beforeEach(() => {
    vi.mocked(getSystemPropValues).mockReturnValue({})
  })

  it('defaults to 50 messages when unset', () => {
    expect(loadChatContextWindowMessages()).toBe(50)
  })

  it('reads configured value from system props', () => {
    vi.mocked(getSystemPropValues).mockReturnValue({
      'chat.ui.contextWindowMessages': '36',
    })
    expect(loadChatContextWindowMessages()).toBe(36)
  })
})
