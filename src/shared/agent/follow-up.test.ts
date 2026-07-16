import { describe, expect, it } from 'vitest'
import {
  buildFollowUpMeta,
  emptyFollowUpMeta,
  followUpItemToUserMessage,
  parseFollowUpAction,
  parseFollowUpItem,
  parseFollowUpMeta,
} from './follow-up'

describe('follow-up shared model', () => {
  it('parses user_input and tool_call actions', () => {
    expect(
      parseFollowUpAction({ type: 'user_input', message: ' Run tests ' }),
    ).toEqual({ type: 'user_input', message: 'Run tests' })
    expect(
      parseFollowUpAction({
        type: 'tool_call',
        tool: 'update_todos',
        args: { todos: [] },
      }),
    ).toEqual({
      type: 'tool_call',
      tool: 'update_todos',
      args: { todos: [] },
    })
    expect(parseFollowUpAction({ type: 'user_input', message: '' })).toBeNull()
    expect(parseFollowUpAction({ type: 'tool_call', tool: '' })).toBeNull()
  })

  it('parses items and assigns ids', () => {
    const item = parseFollowUpItem({
      label: 'Open the plan',
      action: { type: 'user_input', message: 'Show the plan' },
    })
    expect(item).toMatchObject({
      label: 'Open the plan',
      action: { type: 'user_input', message: 'Show the plan' },
    })
    expect(item?.id).toMatch(/^fu_/)
  })

  it('builds replace and append catalogs', () => {
    const first = buildFollowUpMeta({
      conversationId: 'c1',
      items: [
        {
          id: 'a',
          label: 'Ask for draft',
          action: { type: 'user_input', message: 'Draft it' },
          priority: 2,
        },
        {
          id: 'b',
          label: 'Run grep',
          action: {
            type: 'tool_call',
            tool: 'grep_files',
            args: { pattern: 'TODO' },
          },
          priority: 1,
        },
      ],
    })
    expect(first.followUps.map((f) => f.id)).toEqual(['b', 'a'])

    const second = buildFollowUpMeta({
      conversationId: 'c1',
      mode: 'append',
      existing: first,
      items: [
        {
          id: 'a',
          label: 'Ask for revised draft',
          action: { type: 'user_input', message: 'Revise draft' },
          priority: 0,
        },
        {
          id: 'c',
          label: 'Commit',
          action: { type: 'user_input', message: 'Commit changes' },
        },
      ],
    })
    expect(second.followUps.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(second.followUps[0]?.label).toBe('Ask for revised draft')
  })

  it('round-trips meta JSON', () => {
    const meta = emptyFollowUpMeta('conv-1')
    meta.followUps = [
      {
        id: 'x',
        label: 'Continue',
        action: { type: 'user_input', message: 'continue' },
      },
    ]
    const parsed = parseFollowUpMeta(JSON.parse(JSON.stringify(meta)))
    expect(parsed).toEqual(meta)
  })

  it('maps follow-up items to user message text', () => {
    expect(
      followUpItemToUserMessage({
        id: '1',
        label: 'Draft tests',
        action: {
          type: 'user_input',
          message: 'Please add unit tests',
        },
      }),
    ).toBe('Please add unit tests')
    expect(
      followUpItemToUserMessage({
        id: '2',
        label: 'Search for TODOs',
        action: {
          type: 'tool_call',
          tool: 'grep_files',
          args: { pattern: 'TODO' },
        },
      }),
    ).toBe('Search for TODOs')
  })
})
