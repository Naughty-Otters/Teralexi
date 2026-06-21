import { describe, expect, it } from 'vitest'
import {
  extractUserFacingTextFromFinalResult,
  userFacingTextFromStructuredOuter,
} from './assistant-external-reply'

describe('assistant-external-reply', () => {
  it('extractUserFacingTextFromFinalResult drops thinking, planning, and tools', () => {
    const finalResult = [
      '**Thinking**\n\ninternal reasoning',
      '**Planning**\n\nstep plan',
      '**Skills & tool execution**\n\nread_file(...)',
      '**Goals & completed work**\n\ndone items',
      '**Answer**\n\nHello user',
    ].join('\n\n---\n\n')

    expect(extractUserFacingTextFromFinalResult(finalResult)).toBe(
      '**Answer**\n\nHello user',
    )
  })

  it('userFacingTextFromStructuredOuter prefers report over finalResult', () => {
    expect(
      userFacingTextFromStructuredOuter({
        finalResult: '**Thinking**\n\nsecret',
        report: 'User-facing report',
      }),
    ).toBe('User-facing report')
  })

  it('userFacingTextFromStructuredOuter uses research excerpt when report empty', () => {
    expect(
      userFacingTextFromStructuredOuter({
        finalResult: '**Thinking**\n\nsecret',
        report: '',
        researchReport: { paperExcerpt: 'Paper summary' },
      }),
    ).toBe('Paper summary')
  })

  it('userFacingTextFromStructuredOuter filters finalResult when no report', () => {
    expect(
      userFacingTextFromStructuredOuter({
        finalResult: [
          '**Thinking**\n\nsecret',
          '**Summary**\n\nAll done',
        ].join('\n\n---\n\n'),
        report: '',
      }),
    ).toBe('**Summary**\n\nAll done')
  })
})
