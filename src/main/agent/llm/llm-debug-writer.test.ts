import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@config/openfde-home', () => ({
  getopenfdeSandboxDir: vi.fn(() => join(tmpdir(), 'openfde-test-sandbox')),
}))

const getUserProperty = vi.fn()
vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getUserProperty,
  }),
}))

import {
  buildStreamTextDebugRequest,
  createLlmDebugRunId,
  createSubAgentLlmDebugRunId,
  invalidateLlmDebugCache,
  isLlmDebugEnabled,
  resolveLlmDebugRunDir,
  scheduleLlmDebugRequest,
  scheduleLlmDebugResponse,
} from './llm-debug-writer'

const sandboxRoot = join(tmpdir(), 'openfde-test-sandbox')

describe('llm-debug-writer', () => {
  beforeEach(() => {
    invalidateLlmDebugCache()
    getUserProperty.mockReset()
  })

  afterEach(async () => {
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('is disabled by default', () => {
    getUserProperty.mockReturnValue(null)
    expect(isLlmDebugEnabled('default')).toBe(false)
  })

  it('reads enabled flag from user property', () => {
    getUserProperty.mockReturnValue({ propertyValue: 'true' })
    expect(isLlmDebugEnabled('default')).toBe(true)
    expect(getUserProperty).toHaveBeenCalledTimes(1)
    expect(isLlmDebugEnabled('default')).toBe(true)
    expect(getUserProperty).toHaveBeenCalledTimes(1)
  })

  it('resolves debug dir under conversation sandbox', () => {
    const runId = createLlmDebugRunId()
    const dir = resolveLlmDebugRunDir({
      conversationId: 'conv-1',
      llmDebugRunId: runId,
    })
    expect(dir).toContain('llm-debug')
    expect(dir).toContain(runId)
  })

  it('creates sub-agent debug run ids nested under the parent session', () => {
    getUserProperty.mockReturnValue(null)
    const subId = createSubAgentLlmDebugRunId(
      'parent-run-1',
      'skill:coding',
      'default',
    )
    expect(subId).toMatch(/^parent-run-1__sub__coding__[a-z0-9]{4}$/)

    getUserProperty.mockReturnValue({ propertyValue: 'true' })
    invalidateLlmDebugCache()
    const standalone = createSubAgentLlmDebugRunId(undefined, 'coding', 'default')
    expect(standalone).toMatch(/^sub__coding__/)
  })

  it('writes request and response files when enabled', async () => {
    getUserProperty.mockReturnValue({ propertyValue: 'true' })
    const runId = createLlmDebugRunId()
    const ctx = {
      userId: 'default',
      conversationId: 'conv-debug',
      agentId: 'skill:coding',
      llmDebugRunId: runId,
      stepId: 'thinking',
    }
    const callId = scheduleLlmDebugRequest(
      ctx,
      buildStreamTextDebugRequest(
        ctx,
        {
          model: 'test-model',
          instructions: 'Think hard',
          messages: [{ role: 'user', content: 'hi' }],
        },
        'streamText:progress',
      ),
    )
    expect(callId).toBe('001')
    scheduleLlmDebugResponse(
      ctx,
      callId!,
      {
        text: 'hello',
        instructions: 'Think hard',
        messagesBefore: [{ role: 'user', content: 'hi' }],
        toolCalls: [
          {
            order: 1,
            id: 'c1',
            name: 'read_file',
            input: { path: 'a.ts' },
            output: 'ok',
            status: 'completed',
          },
        ],
      },
      {
        callKind: 'streamText',
        label: 'streamText:progress',
      },
    )

    const dir = resolveLlmDebugRunDir(ctx)!
    await new Promise((r) => setTimeout(r, 80))

    const request = await readFile(
      join(dir, '001-streamText-streamText_progress.request.json'),
      'utf8',
    )
    expect(JSON.parse(request).instructions).toBe('Think hard')
    const contextBefore = await readFile(
      join(dir, '001-streamText-streamText_progress.context-before.json'),
      'utf8',
    )
    expect(JSON.parse(contextBefore).messages).toHaveLength(1)
    const contextAfter = await readFile(
      join(dir, '001-streamText-streamText_progress.context-after.json'),
      'utf8',
    )
    const after = JSON.parse(contextAfter)
    expect(after.messages.length).toBeGreaterThan(1)
    expect(after.meta.toolCallCount).toBe(1)
    const response = await readFile(
      join(dir, '001-streamText-streamText_progress.response.txt'),
      'utf8',
    )
    expect(response).toBe('hello')
    const toolCalls = await readFile(
      join(dir, '001-streamText-streamText_progress.tool-calls.json'),
      'utf8',
    )
    expect(JSON.parse(toolCalls)[0]?.name).toBe('read_file')
  })
})
