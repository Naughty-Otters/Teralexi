// @vitest-environment happy-dom

import { describe, expect, it, afterEach } from 'vitest'
import {
  mountChatPanelShell,
  mountCollectFormCard,
  mountToolApprovalCard,
  settleUi,
} from './mount-chat-panel'
import { teardownAppHarness } from './mount-app'

describe('mount-chat-panel harness', () => {
  afterEach(() => {
    teardownAppHarness()
  })

  it('mountCollectFormCard renders a collect-form request', () => {
    const { wrapper } = mountCollectFormCard({
      messageId: 'assistant-1',
      requestId: 'collect-42',
    })

    expect(wrapper.classes()).toContain('hitl-form-card')
    expect(wrapper.props('messageId')).toBe('assistant-1')
  })

  it('mountToolApprovalCard renders a tool approval card', () => {
    const { wrapper } = mountToolApprovalCard()

    expect(wrapper.classes()).toContain('ta')
    expect(wrapper.props('conversationId')).toBe('conv-hitl')
  })

  it('mountChatPanelShell reflects visible text and busy state', () => {
    const { wrapper } = mountChatPanelShell({
      visibleText: 'Streaming reply',
      isBusy: true,
    })

    expect(wrapper.find('.chat-panel-shell__text').text()).toBe('Streaming reply')
    expect(wrapper.find('.chat-panel-shell__busy').text()).toBe('true')
  })

  it('settleUi flushes pending promises', async () => {
    let settled = false
    void Promise.resolve().then(() => {
      settled = true
    })
    await settleUi()
    expect(settled).toBe(true)
  })
})
