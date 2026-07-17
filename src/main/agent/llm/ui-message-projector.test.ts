import { describe, expect, it, vi } from 'vitest'
import {
  forwardAgentUiMessageStream,
  reconcilePendingApprovalKeys,
  collectToolOutputFallbackText,
  isPlaceholderToolResultDisplay,
} from './ui-message-projector'

describe('forwardAgentUiMessageStream', () => {
  it('forwards tool UI chunks but not text-delta', async () => {
    const onUIMessageChunk = vi.fn()
    const pending = new Set<string>()

    async function* uiStream() {
      yield { type: 'text-delta', delta: 'skip me' }
      yield {
        type: 'tool-approval-request',
        toolCallId: 'call-1',
        approvalId: 'appr-1',
      }
      yield {
        type: 'tool-input-available',
        toolCallId: 'call-1',
        toolName: 'run_script',
        input: {},
      }
    }

    await forwardAgentUiMessageStream({
      result: {
        textStream: (async function* () {})(),
        response: Promise.resolve(),
        toUIMessageStream: () => uiStream(),
      },
      onUIMessageChunk,
      pendingApprovals: pending,
    })

    expect(onUIMessageChunk).toHaveBeenCalledTimes(2)
    expect(onUIMessageChunk).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text-delta' }),
    )
    expect(pending.has('call-1')).toBe(true)
    expect(pending.has('approval:appr-1')).toBe(true)
  })
})

describe('reconcilePendingApprovalKeys', () => {
  it('reconciles pending approvals from finalized steps', async () => {
    const pending = new Set(['call-1', 'approval:abc'])
    const next = await reconcilePendingApprovalKeys(pending, [
      { toolResults: [{ toolCallId: 'call-1', output: {} }] },
    ])
    expect(next.has('call-1')).toBe(false)
    expect(next.has('approval:abc')).toBe(true)
  })
})

describe('isPlaceholderToolResultDisplay', () => {
  it('detects empty formatter placeholders', () => {
    expect(isPlaceholderToolResultDisplay('**result** _(empty)_')).toBe(true)
    expect(isPlaceholderToolResultDisplay('**list files** _(empty)_')).toBe(true)
    expect(isPlaceholderToolResultDisplay('**Terminal**\n\n_(no output)_')).toBe(
      true,
    )
    expect(isPlaceholderToolResultDisplay('**File change** _(no diff preview)_')).toBe(
      true,
    )
    expect(isPlaceholderToolResultDisplay('**read file**\n\nhello')).toBe(false)
  })
})

describe('collectToolOutputFallbackText', () => {
  it('fills empty transcript from finalized steps', async () => {
    const text = await collectToolOutputFallbackText({
      textStream: (async function* () {})(),
      response: Promise.resolve(),
      steps: Promise.resolve([
        {
          text: 'from steps',
          toolResults: [{ output: { ok: true } }],
        },
      ]),
      text: Promise.resolve('fallback'),
    })
    expect(text).toContain('from steps')
    expect(text).toContain('ok')
  })

  it('skips empty result placeholders and labels non-empty query tools', async () => {
    const text = await collectToolOutputFallbackText({
      textStream: (async function* () {})(),
      response: Promise.resolve(),
      steps: Promise.resolve([
        {
          toolResults: [
            { toolName: 'list_files', output: { entries: [] } },
            {
              toolName: 'read_file',
              input: { path: 'README.md' },
              output: { content: 'hello world' },
            },
            { output: { paths: [] } },
            { output: { ok: true } },
          ],
        },
      ]),
    })
    expect(text).not.toMatch(/result\s*\(empty\)/i)
    expect(text).not.toContain('_(empty)_')
    expect(text).toContain('read file')
    expect(text).toContain('hello world')
    expect(text).toContain('ok')
  })
})
