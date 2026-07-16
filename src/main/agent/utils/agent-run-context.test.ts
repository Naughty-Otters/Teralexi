import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadAgentRunCredentials,
  loadConversationHistory,
  resolveEnabledSkillToolNames,
} from './agent-run-context'

const { getMessagesMock } = vi.hoisted(() => ({
  getMessagesMock: vi.fn(() => [
    { id: 'u1', role: 'user', content: 'hi' },
    { id: 'a1', role: 'assistant', content: 'hello' },
  ]),
}))

vi.mock('@config/system-prop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@config/system-prop')>()
  return {
    ...actual,
    getSystemPropValues: vi.fn(() => ({
      'settings.ollama.baseUrl': 'http://localhost:11434/',
      'settings.openai.baseUrl': 'https://api.openai.com/v1/',
    })),
  }
})

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getMessages: getMessagesMock,
  }),
}))

beforeEach(() => {
  getMessagesMock.mockReset()
  getMessagesMock.mockReturnValue([
    { id: 'u1', role: 'user', content: 'hi' },
    { id: 'a1', role: 'assistant', content: 'hello' },
  ])
})

describe('loadAgentRunCredentials', () => {
  it('normalizes base URLs from system props', () => {
    const creds = loadAgentRunCredentials()
    expect(creds.ollamaBaseURL).toBe('http://localhost:11434')
    expect(creds.openaiBaseURL).toBe('https://api.openai.com/v1')
    expect(creds.openAiCompatible.moonshot.baseURL).toBe(
      'https://api.moonshot.ai/v1',
    )
    expect(creds.openAiCompatible.qwen.baseURL).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    )
  })
})

describe('loadConversationHistory', () => {
  it('excludes the in-flight assistant message', () => {
    const history = loadConversationHistory('c1', 'a1')
    expect(history).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('preserves multi-turn store history order', () => {
    getMessagesMock.mockReturnValueOnce([
      { id: 'u1', role: 'user', content: 'First question' },
      { id: 'a1', role: 'assistant', content: 'First answer' },
      { id: 'u2', role: 'user', content: 'Follow-up question' },
      { id: 'a2', role: 'assistant', content: '' },
    ])

    const history = loadConversationHistory('c-multi', 'a2')

    expect(getMessagesMock).toHaveBeenCalledWith('c-multi')
    expect(history.map((m) => m.content)).toEqual([
      'First question',
      'First answer',
      'Follow-up question',
    ])
  })
})

describe('resolveEnabledSkillToolNames', () => {
  it('returns availableSet when touched', () => {
    expect(
      resolveEnabledSkillToolNames({
        availableSetTouched: true,
        availableSet: ['read_file'],
      } as never),
    ).toEqual(['read_file'])
  })

  it('returns undefined when set not touched', () => {
    expect(
      resolveEnabledSkillToolNames({ availableSet: ['x'] } as never),
    ).toBeUndefined()
  })
})
