import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@teralexi-ai'
import { resolveAssistantBubbles, resolveHitlBubbles, extractVisibleLlmErrorsFromMessage } from './assistantBubbleFramework'

function messageWithParts(parts: unknown[]): UIMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    parts: parts as UIMessage['parts'],
  }
}

describe('assistantBubbleFramework', () => {
  it('resolves reasoning bubbles when reasoning parts have text', () => {
    const message = messageWithParts([
      { type: 'reasoning', text: 'thinking aloud', state: 'streaming' },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.kind).toBe('reasoning')
  })

  it('resolves markdown bubbles for text parts in non-structured mode', () => {
    const message = messageWithParts([
      { type: 'text', text: 'hello', state: 'complete' },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.kind).toBe('markdown')
  })

  it('resolveHitlBubbles returns only form and approval parts', () => {
    const message = messageWithParts([
      { type: 'text', text: 'hello', state: 'complete' },
      { type: 'data-collect-form-request', id: 'req-1', data: { fields: [] } },
      {
        type: 'tool-read_file',
        state: 'approval-requested',
        input: { path: 'a.txt' },
      },
    ])

    expect(resolveHitlBubbles(message).map((b) => b.kind)).toEqual([
      'form',
      'approval',
    ])
  })

  it('resolves form and approval bubbles by part type and state', () => {
    const message = messageWithParts([
      { type: 'data-collect-form-request', id: 'req-1', data: { fields: [] } },
      {
        type: 'tool-read_file',
        state: 'approval-requested',
        input: { path: 'a.txt' },
      },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles.map((b) => b.kind)).toEqual(['form', 'approval'])
  })

  it('routes file-change tool results to diff bubbles', () => {
    const message = messageWithParts([
      {
        type: 'tool-edit_files',
        state: 'output-available',
        input: { path: 'a.txt' },
        approval: { id: 'ap-1' },
        output: {
          path: 'a.txt',
          diff: 'Index: a.txt\n--- a.txt\n+++ a.txt\n@@ -1 +1 @@\n-old\n+new',
          additions: 1,
          deletions: 1,
        },
      },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.kind).toBe('diff')
  })

  it('routes terminal-like tools to terminal bubbles', () => {
    const message = messageWithParts([
      {
        type: 'tool-bash',
        state: 'output-available',
        input: { command: 'ls -la' },
        output: 'line1\nline2',
      },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.kind).toBe('terminal')
  })

  it('shows terminal + diff when shell output includes workspace files[]', () => {
    const message = messageWithParts([
      {
        type: 'tool-shell',
        state: 'output-available',
        input: { command: ['sh', '-c', 'echo hi > a.ts'] },
        output: {
          stdout: '',
          stderr: '',
          exitCode: 0,
          output: '',
          files: [
            {
              path: 'a.ts',
              diff: '+hi',
              additions: 1,
              deletions: 0,
              action: 'create',
              workspacePath: '/tmp/ws',
            },
          ],
        },
      },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles.map((b) => b.kind)).toEqual(['terminal', 'diff'])
  })


  it('groups agentic-run tool calls into one tool-group panel', () => {
    const progressPart = {
      type: 'data-agent-step-progress',
      data: { stepId: 'toolLoop', title: 'Agentic Run', status: 'running' },
    }
    const message = messageWithParts([
      progressPart,
      {
        type: 'tool-read_file',
        state: 'output-available',
        input: { path: 'a.ts' },
        output: { content: 'line' },
      },
      {
        type: 'tool-bash',
        state: 'output-available',
        input: { command: 'ls' },
        output: 'a.ts\n',
      },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: (_msg, part) => part === progressPart,
    })

    expect(bubbles.map((b) => b.kind)).toEqual(['step-progress', 'tool-group'])
    const group = bubbles[1]?.payload as { items: Array<{ kind: string }> }
    expect(group.items).toHaveLength(2)
    expect(group.items.map((item) => item.kind)).toEqual(['tool', 'terminal'])
  })

  it('keeps standalone tool bubbles when there is no tool-loop step', () => {
    const message = messageWithParts([
      {
        type: 'tool-read_file',
        state: 'output-available',
        input: { path: 'a.ts' },
        output: { content: 'line' },
      },
      {
        type: 'tool-grep_files',
        state: 'output-available',
        input: { pattern: 'foo' },
        output: { matches: 'hit' },
      },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles.map((b) => b.kind)).toEqual(['tool', 'tool'])
  })

  it('routes step progress when callback allows it', () => {
    const progressPart = {
      type: 'data-agent-step-progress',
      data: { title: 'Plan', status: 'running', content: 'Planning...' },
    }
    const message = messageWithParts([
      { type: 'text', text: 'ignored in structured mode', state: 'complete' },
      progressPart,
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: (_msg, part) => part === progressPart,
    })

    expect(bubbles).toHaveLength(2)
    expect(bubbles.some((bubble) => bubble.kind === 'step-progress')).toBe(true)
  })

  it('routes planning text to list-items bubble', () => {
    const planningText = [
      '🎯 Final goal: Create a release summary report',
      'Success expectations (for summary):',
      '  1. Every todo is completed',
      'Todo list:',
      '1. ⏳ Gather release notes: Collect tagged changes from repository',
      '   ✓ Success: Notes include all merged PRs',
      '2. ⏳ Draft summary: Write release highlights',
      '   ↩ Fallback: retry',
    ].join('\n')

    const message = messageWithParts([
      { type: 'text', text: planningText, state: 'complete' },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.kind).toBe('list-items')
    const payload = bubbles[0]?.payload as {
      finalGoal?: string
      expectations: string[]
      items: Array<{ title: string }>
    }
    expect(payload.finalGoal).toContain('release summary report')
    expect(payload.expectations).toEqual(['Every todo is completed'])
    expect(payload.items.map((item) => item.title)).toEqual([
      'Gather release notes',
      'Draft summary',
    ])
  })

  it('routes planning step-progress content to list-items bubble', () => {
    const progressPart = {
      type: 'data-agent-step-progress',
      data: {
        stepId: 'planning',
        title: 'Planning',
        status: 'running',
        content: [
          'Final goal: Produce onboarding checklist',
          'Todo list:',
          '1. Draft checklist: Include setup and verification steps',
        ].join('\n'),
      },
    }
    const message = messageWithParts([progressPart])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: (_msg, part) => part === progressPart,
    })

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.kind).toBe('list-items')
  })

  it('parses markdown header planning blocks into list-items bubble', () => {
    const planningText = [
      '## Final goal: Ship onboarding docs',
      '### Success expectations',
      '- Every checklist section is covered',
      '## Todo list',
      '- [ ] Draft structure: Create section outline',
      '- [ ] Fill examples: Add concrete examples',
      '- ✓ Success: examples compile',
    ].join('\n')

    const message = messageWithParts([
      { type: 'text', text: planningText, state: 'complete' },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.kind).toBe('list-items')
    const payload = bubbles[0]?.payload as {
      finalGoal?: string
      expectations: string[]
      items: Array<{ title: string; details: string[] }>
    }
    expect(payload.finalGoal).toBe('Ship onboarding docs')
    expect(payload.expectations).toEqual(['Every checklist section is covered'])
    expect(payload.items.map((item) => item.title)).toEqual([
      'Draft structure',
      'Fill examples',
    ])
    expect(payload.items[1]?.details).toEqual(['✓ Success: examples compile'])
  })

  it('routes agent error text parts to error bubbles', () => {
    const message = messageWithParts([
      {
        type: 'text',
        text: '⚠ **Agent error:** LLM request failed (auth HTTP 401): Unauthorized',
        state: 'done',
      },
    ])

    const bubbles = resolveAssistantBubbles(message, {
      structuredLayoutEnabled: false,
      shouldShowStepProgress: () => false,
    })

    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]?.kind).toBe('error')
  })

  it('extractVisibleLlmErrorsFromMessage collects text and step progress errors', () => {
    const message = messageWithParts([
      {
        type: 'data-agent-step-progress',
        id: 'step-1',
        data: {
          content: '\n\n⚠ **LLM error** (toolLoop): LLM request failed (rate_limit): too many\n\n',
        },
      },
      {
        type: 'text',
        text: '⚠ **Agent error:** LLM request failed (server_error HTTP 503): unavailable',
        state: 'done',
      },
    ])

    const errors = extractVisibleLlmErrorsFromMessage(message)
    expect(errors).toHaveLength(2)
    expect(errors.some((e) => e.includes('rate_limit'))).toBe(true)
    expect(errors.some((e) => e.includes('Agent error'))).toBe(true)
  })
})
