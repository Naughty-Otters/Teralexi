import { describe, expect, it, vi } from 'vitest'
import {
  loadAgentRunCredentials,
  loadConversationHistory,
  resolveEnabledSkillToolNames,
} from './agent-run-context'

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
    getMessages: vi.fn(() => [
      { id: 'u1', role: 'user', content: 'hi' },
      { id: 'a1', role: 'assistant', content: 'hello' },
    ]),
  }),
}))

describe('loadAgentRunCredentials', () => {
  it('normalizes base URLs from system props', () => {
    const creds = loadAgentRunCredentials()
    expect(creds.ollamaBaseURL).toBe('http://localhost:11434')
    expect(creds.openaiBaseURL).toBe('https://api.openai.com/v1')
    expect(creds.openAiCompatible.moonshot.baseURL).toBe(
      'https://api.moonshot.cn/v1',
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
