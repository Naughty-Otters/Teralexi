import { describe, expect, it } from 'vitest'
import {
  assistantTextPartMarkdown,
  bubblePdfDefaultFileName,
  bubblePdfKindForSection,
} from './bubblePdfExport'

describe('bubblePdfExport', () => {
  it('maps report section ids to research-report kind', () => {
    expect(bubblePdfKindForSection('ReportStep')).toBe('research-report')
    expect(bubblePdfKindForSection('report')).toBe('research-report')
    expect(bubblePdfKindForSection('ThinkingStep')).toBe('default')
  })

  it('builds a slugged default pdf file name', () => {
    expect(bubblePdfDefaultFileName('Final Result', 'msg-abc12345')).toBe(
      'final-result-msg-abc1.pdf',
    )
  })

  it('extracts markdown from assistant text parts', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      parts: [{ type: 'text', text: '# Hello\n\nWorld' }],
    } as never
    expect(
      assistantTextPartMarkdown(message, message.parts[0]),
    ).toBe('# Hello\n\nWorld')
  })
})
