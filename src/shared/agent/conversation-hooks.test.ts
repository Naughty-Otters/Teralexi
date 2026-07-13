import { describe, expect, it } from 'vitest'
import {
  parseConversationHookEntry,
  parseConversationHooksConfig,
  serializeConversationHooksConfig,
} from './conversation-hooks'

describe('conversation-hooks', () => {
  it('parses a valid hook entry and assigns an id when missing', () => {
    const entry = parseConversationHookEntry({
      event: 'preHook',
      command: 'node',
      args: ['hook.js'],
    })
    expect(entry).toMatchObject({
      event: 'preHook',
      command: 'node',
      args: ['hook.js'],
      enabled: true,
    })
    expect(entry?.id).toMatch(/^hook_/)
  })

  it('rejects invalid events or empty commands', () => {
    expect(parseConversationHookEntry({ event: 'beforeToolCall', command: 'x' })).toBeNull()
    expect(parseConversationHookEntry({ event: 'preHook', command: '  ' })).toBeNull()
    expect(parseConversationHookEntry(null)).toBeNull()
  })

  it('parses config arrays and drops invalid rows', () => {
    const config = parseConversationHooksConfig({
      hooks: [
        { id: 'a', event: 'preHook', command: 'echo' },
        { event: 'nope', command: 'x' },
        { id: 'b', event: 'postHook', command: 'notify', enabled: false },
      ],
    })
    expect(config.hooks).toHaveLength(2)
    expect(config.hooks[0]).toMatchObject({ id: 'a', event: 'preHook' })
    expect(config.hooks[1]).toMatchObject({
      id: 'b',
      event: 'postHook',
      enabled: false,
    })
  })

  it('round-trips via serialize', () => {
    const raw = {
      hooks: [
        {
          id: 'h1',
          event: 'postHook' as const,
          command: '/bin/true',
          enabled: true,
        },
      ],
    }
    const json = serializeConversationHooksConfig(raw)
    expect(parseConversationHooksConfig(JSON.parse(json))).toEqual(raw)
  })
})
