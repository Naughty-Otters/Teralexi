import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSystemPropValues, loadAgentRunCredentials } = vi.hoisted(() => ({
  getSystemPropValues: vi.fn(),
  loadAgentRunCredentials: vi.fn(),
}))

vi.mock('@config/system-prop', () => ({
  getSystemPropValues,
}))

vi.mock('@main/agent/utils/agent-run-context', () => ({
  loadAgentRunCredentials,
}))

import {
  __resolveCompletionEndpointForTest,
  __resolveCompletionStrategyForTest,
  completeEditorAi,
} from './editor-ai-completion'

const baseCreds = {
  ollamaBaseURL: 'http://localhost:11434',
  llamacppBaseURL: 'http://127.0.0.1:8080/v1',
  llamacppApiKey: '',
  anthropicApiKey: '',
  anthropicBaseURL: 'https://api.anthropic.com/v1',
  openaiApiKey: 'sk-test',
  openaiBaseURL: 'https://api.openai.com/v1',
  geminiApiKey: '',
  geminiBaseURL: 'https://generativelanguage.googleapis.com/v1beta',
  deepseekApiKey: 'ds-test',
  deepseekApiUrl: 'https://api.deepseek.com/v1',
  zhipuApiKey: '',
  zhipuBaseURL: 'https://api.z.ai/api/paas/v4',
  openAiCompatible: {
    moonshot: { apiKey: '', baseURL: 'https://api.moonshot.ai/v1' },
    qwen: { apiKey: '', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    bytedance: { apiKey: '', baseURL: 'https://ark.cn-beijing.volces.com/api/v3' },
    huggingface: { apiKey: '', baseURL: 'https://router.huggingface.co/v1' },
    'nvidia-nim': { apiKey: '', baseURL: 'https://integrate.api.nvidia.com/v1' },
    fireworks: { apiKey: '', baseURL: 'https://api.fireworks.ai/inference/v1' },
    openrouter: { apiKey: '', baseURL: 'https://openrouter.ai/api/v1' },
    custom: { apiKey: '', baseURL: '' },
  },
}

describe('editor-ai-completion', () => {
  beforeEach(() => {
    getSystemPropValues.mockReset()
    loadAgentRunCredentials.mockReset()
    loadAgentRunCredentials.mockReturnValue(baseCreds)
    vi.stubGlobal('fetch', vi.fn())
  })

  it('resolves provider completion endpoints from credentials', () => {
    expect(__resolveCompletionEndpointForTest('ollama', 'qwen2.5-coder:7b', baseCreds)).toEqual({
      strategy: 'fim-completions',
      kind: 'ollama',
      url: 'http://localhost:11434/api/generate',
    })
    expect(__resolveCompletionEndpointForTest('openai', 'gpt-4o', baseCreds)).toEqual({
      strategy: 'chat',
      kind: 'openai-chat',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
    })
    expect(
      __resolveCompletionEndpointForTest('deepseek', 'deepseek-coder', baseCreds),
    ).toEqual({
      strategy: 'fim-completions',
      kind: 'openai-completions',
      url: 'https://api.deepseek.com/v1/completions',
      headers: {
        Authorization: 'Bearer ds-test',
        'Content-Type': 'application/json',
      },
    })
    expect(__resolveCompletionEndpointForTest('deepseek', 'deepseek-chat', baseCreds)).toEqual({
      strategy: 'chat',
      kind: 'openai-chat',
      url: 'https://api.deepseek.com/v1/chat/completions',
      headers: {
        Authorization: 'Bearer ds-test',
        'Content-Type': 'application/json',
      },
    })
  })

  it('uses chat infill for general-purpose cloud models', () => {
    expect(__resolveCompletionStrategyForTest('openai', 'gpt-4o')).toBe('chat')
    expect(__resolveCompletionStrategyForTest('moonshot', 'kimi-k2.5')).toBe('chat')
    expect(__resolveCompletionStrategyForTest('deepseek', 'deepseek-coder')).toBe(
      'fim-completions',
    )
  })

  it('sends at most four stop tokens to openai-compatible completion APIs', async () => {
    getSystemPropValues.mockReturnValue({
      'editor.settings.aiCompletionEnabled': 'true',
      'editor.settings.aiCompletionProvider': 'deepseek',
      'editor.settings.aiCompletionModel': 'deepseek-coder',
      'editor.settings.aiCompletionMaxTokens': '64',
    })

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ text: 'value = 1;' }] }),
    } as Response)

    await completeEditorAi({
      conversationId: 'conv-1',
      prefix: 'const ',
      suffix: '',
      languageId: 'typescript',
      relativePath: 'src/a.ts',
    })

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))
    expect(body.stop).toHaveLength(4)
  })

  it('falls back to chat when FIM completion fails', async () => {
    getSystemPropValues.mockReturnValue({
      'editor.settings.aiCompletionEnabled': 'true',
      'editor.settings.aiCompletionProvider': 'deepseek',
      'editor.settings.aiCompletionModel': 'deepseek-coder',
      'editor.settings.aiCompletionMaxTokens': '64',
    })

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'FIM not supported',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'value = 1;' } }] }),
      } as Response)

    const result = await completeEditorAi({
      conversationId: 'conv-1',
      prefix: 'const ',
      suffix: '',
      languageId: 'typescript',
      relativePath: 'src/a.ts',
    })

    expect(result).toEqual({ ok: true, completion: 'value = 1;' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.deepseek.com/v1/completions',
      expect.anything(),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.deepseek.com/v1/chat/completions',
      expect.anything(),
    )
  })

  it('falls back from ollama FIM to ollama chat', async () => {
    getSystemPropValues.mockReturnValue({
      'editor.settings.aiCompletionEnabled': 'true',
      'editor.settings.aiCompletionProvider': 'ollama',
      'editor.settings.aiCompletionModel': 'qwen2.5-coder:7b',
      'editor.settings.aiCompletionMaxTokens': '64',
    })

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'model not found',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: 'value = 1;' } }),
      } as Response)

    const result = await completeEditorAi({
      conversationId: 'conv-1',
      prefix: 'const ',
      suffix: '',
      languageId: 'typescript',
      relativePath: 'src/a.ts',
    })

    expect(result).toEqual({ ok: true, completion: 'value = 1;' })
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:11434/api/generate',
      expect.anything(),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:11434/api/chat',
      expect.anything(),
    )
  })

  it('uses chat completions for gpt-4o', async () => {
    getSystemPropValues.mockReturnValue({
      'editor.settings.aiCompletionEnabled': 'true',
      'editor.settings.aiCompletionProvider': 'openai',
      'editor.settings.aiCompletionModel': 'gpt-4o',
      'editor.settings.aiCompletionMaxTokens': '64',
    })

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'value = 1;' } }] }),
    } as Response)

    const result = await completeEditorAi({
      conversationId: 'conv-1',
      prefix: 'const ',
      suffix: '',
      languageId: 'typescript',
      relativePath: 'src/a.ts',
    })

    expect(result).toEqual({ ok: true, completion: 'value = 1;' })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('returns disabled error when AI completion is off', async () => {
    getSystemPropValues.mockReturnValue({
      'editor.settings.aiCompletionEnabled': 'false',
    })

    const result = await completeEditorAi({
      conversationId: 'conv-1',
      prefix: 'const ',
      suffix: '',
      languageId: 'typescript',
      relativePath: 'src/a.ts',
    })

    expect(result).toEqual({ ok: false, error: 'AI completion is disabled.' })
  })

  it('requests Ollama FIM completion when enabled', async () => {
    getSystemPropValues.mockReturnValue({
      'editor.settings.aiCompletionEnabled': 'true',
      'editor.settings.aiCompletionProvider': 'ollama',
      'editor.settings.aiCompletionModel': 'qwen2.5-coder:7b',
      'editor.settings.aiCompletionMaxTokens': '64',
    })

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'value = 1;' }),
    } as Response)

    const result = await completeEditorAi({
      conversationId: 'conv-1',
      prefix: 'const ',
      suffix: '',
      languageId: 'typescript',
      relativePath: 'src/a.ts',
    })

    expect(result).toEqual({ ok: true, completion: 'value = 1;' })
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('qwen2.5-coder:7b'),
      }),
    )
  })
})
