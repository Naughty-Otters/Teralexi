import { describe, expect, it } from 'vitest'
import {
  HEAD_TAIL_KEEP_CHARS,
  HEAD_TAIL_OMISSION,
} from '@shared/text/truncate-head-tail'
import {
  limitMessageContentForPersistence,
  limitPersistedReportText,
  limitPersistedStepText,
  PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
} from './limit-persisted-content'

describe('limitPersistedStepText', () => {
  it('keeps head and tail with omission in the middle', () => {
    const head = 'H'.repeat(HEAD_TAIL_KEEP_CHARS)
    const tail = 'T'.repeat(HEAD_TAIL_KEEP_CHARS)
    const text = `${head}MIDDLE${tail}`
    const limited = limitPersistedStepText(text)
    expect(limited).toBe(`${head}${HEAD_TAIL_OMISSION}${tail}`)
    expect(limited).not.toContain('MIDDLE')
  })
})

describe('limitMessageContentForPersistence', () => {
  it('truncates plain user messages with head and tail', () => {
    const head = 'u'.repeat(HEAD_TAIL_KEEP_CHARS)
    const tail = 'v'.repeat(HEAD_TAIL_KEEP_CHARS)
    const text = `${head}${'x'.repeat(500)}${tail}`
    const limited = limitMessageContentForPersistence(text, 'user')
    expect(limited.startsWith(head)).toBe(true)
    expect(limited.endsWith(tail)).toBe(true)
    expect(limited).toContain(HEAD_TAIL_OMISSION)
  })

  it('strips streamingText and caps structured fields', () => {
    const head = 'x'.repeat(HEAD_TAIL_KEEP_CHARS)
    const tail = 'y'.repeat(HEAD_TAIL_KEEP_CHARS)
    const longField = `${head}${'z'.repeat(500)}${tail}`
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: longField,
          report: '',
          streamingText: 'should not persist',
          pipelineConversation: [
            {
              sectionId: 'ThinkingStep',
              stepId: 'thinking',
              title: 'Thinking',
              content: longField,
              status: 'completed',
            },
          ],
        },
        subSteps: [
          {
            type: 'ThinkingStep',
            title: 'Thinking',
            content: longField,
          },
        ],
      },
    }

    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    const parsed = JSON.parse(limited) as {
      assistantContent: {
        outer: { streamingText?: string; finalResult: string }
        subSteps: Array<{ content: string }>
      }
    }

    expect(parsed.assistantContent.outer.streamingText).toBeUndefined()
    expect(parsed.assistantContent.outer.finalResult).toContain(
      HEAD_TAIL_OMISSION,
    )
    expect(parsed.assistantContent.subSteps[0]?.content).toContain(
      HEAD_TAIL_OMISSION,
    )
  })

  it('falls back to truncation for invalid assistant json', () => {
    const head = 'a'.repeat(HEAD_TAIL_KEEP_CHARS)
    const tail = 'b'.repeat(HEAD_TAIL_KEEP_CHARS)
    const text = `${head}${'x'.repeat(1200)}${tail}`
    const limited = limitMessageContentForPersistence(text, 'assistant')
    expect(limited.startsWith(head)).toBe(true)
    expect(limited.endsWith(tail)).toBe(true)
    expect(limited).toContain(HEAD_TAIL_OMISSION)
  })

  it('shrinks oversized structured payload by dropping pipeline turns', () => {
    const huge = 'z'.repeat(Math.floor(PERSISTED_MESSAGE_CONTENT_MAX_CHARS / 2))
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: huge,
          report: huge,
          pipelineConversation: [
            { content: huge },
            { content: huge },
            { content: huge },
          ],
        },
        subSteps: [{ content: huge }],
      },
    }

    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(limited.length).toBeLessThanOrEqual(
      PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
    )
    const parsed = JSON.parse(limited) as {
      assistantContent: { outer: { pipelineConversation?: unknown[] } }
    }
    expect(
      (parsed.assistantContent.outer.pipelineConversation ?? []).length,
    ).toBeLessThanOrEqual(3)
  })

  it('limitPersistedReportText shares head-tail truncation behavior', () => {
    const head = 'r'.repeat(HEAD_TAIL_KEEP_CHARS)
    const tail = 's'.repeat(HEAD_TAIL_KEEP_CHARS)
    const limited = limitPersistedReportText(`${head}${'y'.repeat(500)}${tail}`)
    expect(limited).toContain(HEAD_TAIL_OMISSION)
    expect(limited.startsWith(head)).toBe(true)
    expect(limited.endsWith(tail)).toBe(true)
  })

  it('strips prose fences before persisting truncated step text', () => {
    const row = '| 1 | 3:38 PM | GitHub | subject |\n'
    const table =
      '| # | Time | From | Subject |\n|---|------|------|----------|\n' +
      row.repeat(400)
    const raw = `\`\`\`### 📬 Today\n\n${table}\n\`\`\``
    const limited = limitPersistedStepText(raw)
    expect(limited.startsWith('```')).toBe(false)
    expect(limited).toContain(HEAD_TAIL_OMISSION)
    expect(limited).toContain('### 📬 Today')
  })

  it('handles structured payload with empty pipeline', () => {
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: 'x'.repeat(200000),
          report: 'y'.repeat(200000),
          pipelineConversation: [],
        },
        subSteps: [],
      },
    }
    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(limited.length).toBeLessThanOrEqual(
      PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
    )
    const parsed = JSON.parse(limited)
    expect(parsed.assistantContent.outer.finalResult).toContain(
      HEAD_TAIL_OMISSION,
    )
  })

  it('handles payload with only outer fields (no pipeline)', () => {
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: 'x'.repeat(200000),
          report: 'y'.repeat(200000),
        },
        subSteps: [{ content: 'z'.repeat(200000) }],
      },
    }
    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(limited.length).toBeLessThanOrEqual(
      PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
    )
    const parsed = JSON.parse(limited)
    expect(parsed.assistantContent.outer.finalResult).toContain(
      HEAD_TAIL_OMISSION,
    )
  })

  it('handles malformed pipeline entries with missing content fields', () => {
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: 'x'.repeat(300000),
          pipelineConversation: [
            { sectionId: 'test', stepId: '1' },
            { content: 'x'.repeat(300000) },
            { content: null },
            { content: undefined },
          ],
        },
        subSteps: [],
      },
    }
    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(limited.length).toBeLessThanOrEqual(
      PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
    )
  })

  it('falls back to truncation when shrinking exhausts all pipeline turns', () => {
    const huge = 'x'.repeat(
      Math.floor(PERSISTED_MESSAGE_CONTENT_MAX_CHARS * 0.8),
    )
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: huge,
          report: huge,
          pipelineConversation: [{ content: 'y'.repeat(1000) }],
        },
        subSteps: [{ content: huge }],
      },
    }
    const limited = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(limited.length).toBeLessThanOrEqual(
      PERSISTED_MESSAGE_CONTENT_MAX_CHARS,
    )
  })
})
