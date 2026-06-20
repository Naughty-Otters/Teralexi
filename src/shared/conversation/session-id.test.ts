import { describe, expect, it } from 'vitest'
import {
  buildChannelSessionId,
  buildSchedulerSessionId,
  classifyConversationSessionId,
  isBoundSessionId,
  resolveChannelSessionId,
  resolveSchedulerSessionId,
} from './session-id'

describe('session-id', () => {
  it('builds stable channel and scheduler ids', () => {
    expect(buildChannelSessionId('whatsapp', '1555@s.whatsapp.net')).toBe(
      'channel:whatsapp:1555@s.whatsapp.net',
    )
    expect(buildSchedulerSessionId('job-1')).toBe('scheduler:job-1')
  })

  it('classifies bound sessions', () => {
    expect(classifyConversationSessionId('channel:whatsapp:a')).toBe('channel')
    expect(classifyConversationSessionId('scheduler:abc')).toBe('scheduler')
    expect(classifyConversationSessionId('1555@s.whatsapp.net')).toBe('channel')
    expect(classifyConversationSessionId('uuid')).toBe('ui')
    expect(isBoundSessionId('scheduler:x')).toBe(true)
    expect(isBoundSessionId('uuid')).toBe(false)
  })

  it('resolveChannelSessionId prefers canonical then legacy', () => {
    const lookup = (id: string) =>
      id === 'legacy-user' ? { id } : null
    expect(
      resolveChannelSessionId({
        channelId: 'whatsapp',
        senderId: 'legacy-user',
        lookupConversation: lookup,
      }),
    ).toBe('legacy-user')
    expect(
      resolveChannelSessionId({
        channelId: 'whatsapp',
        senderId: 'new-user',
        lookupConversation: () => null,
      }),
    ).toBe('channel:whatsapp:new-user')
  })

  it('resolveSchedulerSessionId uses explicit conversation id when set', () => {
    expect(
      resolveSchedulerSessionId({
        id: 'job-1',
        conversationId: 'custom-thread',
      }),
    ).toBe('custom-thread')
    expect(resolveSchedulerSessionId({ id: 'job-1' })).toBe('scheduler:job-1')
  })
})
