import { describe, expect, it } from 'vitest'
import {
  extractUserFacingTextFromFinalResult,
  userFacingTextFromPipelineConversation,
  userFacingTextFromStructuredOuter,
} from './assistant-external-reply'

describe('assistant-external-reply', () => {
  it('extractUserFacingTextFromFinalResult drops thinking, planning, and tool dumps', () => {
    const finalResult = [
      '**Thinking**\n\ninternal reasoning',
      '**Planning**\n\nstep plan',
      '**Skills & tool execution**\n\nread_file(...)',
      '**Goals & completed work**\n\ndone items',
      '**Answer**\n\nHello user',
    ].join('\n\n---\n\n')

    expect(extractUserFacingTextFromFinalResult(finalResult)).toBe('Hello user')
  })

  it('extractUserFacingTextFromFinalResult keeps agentic prose after stripping titles', () => {
    const finalResult =
      '**Skills & tool execution**\n\n**Agentic Run**\n\nI am **Claude**, built by **Anthropic**.'

    expect(extractUserFacingTextFromFinalResult(finalResult)).toBe(
      'I am **Claude**, built by **Anthropic**.',
    )
  })

  it('extractUserFacingTextFromFinalResult strips wrapper headers but keeps body', () => {
    expect(
      extractUserFacingTextFromFinalResult('# Final result\n\nHello world'),
    ).toBe('Hello world')
  })

  it('extractUserFacingTextFromFinalResult drops artifact index and tool-only agentic sections', () => {
    const finalResult = [
      '**Summary**\n\nAll done',
      '# Artifact index\n\n- `output/results/file.md`',
      '**Agentic Run**\n\nread_file(...)',
      '**Agentic Run Task 2 Attempt 1**\n\nlist_files(...)',
    ].join('\n\n---\n\n')

    expect(extractUserFacingTextFromFinalResult(finalResult)).toBe('All done')
  })

  it('userFacingTextFromPipelineConversation prefers summary and strips titles', () => {
    expect(
      userFacingTextFromPipelineConversation([
        {
          sectionId: 'SkillsToolExecutionStep',
          content: '**Agentic Run**\n\nTooling only read_file(...)',
        },
        {
          sectionId: 'SummaryStep',
          content: '**Summary**\n\nAll done',
        },
      ]),
    ).toBe('All done')
  })

  it('userFacingTextFromPipelineConversation uses last prose agentic turn when no summary', () => {
    expect(
      userFacingTextFromPipelineConversation([
        {
          sectionId: 'SkillsToolExecutionStep',
          content:
            "I'm **Claude**, built by **Anthropic**. Is there something I can help you with?",
        },
      ]),
    ).toBe("I'm **Claude**, built by **Anthropic**. Is there something I can help you with?")
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

  it('userFacingTextFromStructuredOuter falls back to pipeline conversation', () => {
    expect(
      userFacingTextFromStructuredOuter({
        finalResult:
          '**Skills & tool execution**\n\n**Agentic Run**\n\nread_file(...)',
        report: '',
        pipelineConversation: [
          {
            sectionId: 'SkillsToolExecutionStep',
            content: "I'm **Claude**, built by **Anthropic**.",
          },
        ],
      }),
    ).toBe("I'm **Claude**, built by **Anthropic**.")
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
    ).toBe('All done')
  })
})
