import { describe, expect, it } from 'vitest'
import {
  isAssistantStructuredContent,
  parseAssistantStructuredContent,
  serializeAssistantMessageForHistory,
} from './structured-content'

const validPayload = {
  version: 2,
  assistantContent: {
    outer: {
      finalResult: 'Done',
      report: 'Full report',
      stepCaptures: [
        {
          stepType: 'SearchStep',
          title: 'Search',
          content: 'hits',
          outputPaths: ['/tmp/a'],
        },
      ],
      allArtifactPaths: ['/tmp/a', '/tmp/b'],
    },
    subSteps: [{ type: 'SearchStep', title: 'Search', content: 'hits' }],
  },
}

describe('structured-content', () => {
  it('validates structured assistant JSON', () => {
    expect(isAssistantStructuredContent(validPayload)).toBe(true)
    expect(isAssistantStructuredContent({ version: 1 })).toBe(false)
    expect(
      isAssistantStructuredContent({
        ...validPayload,
        assistantContent: {
          ...validPayload.assistantContent,
          outer: {
            ...validPayload.assistantContent.outer,
            stepCaptures: [{ stepType: 'x', title: 't', content: 'c' }],
          },
        },
      }),
    ).toBe(false)
    expect(
      isAssistantStructuredContent({
        ...validPayload,
        assistantContent: {
          ...validPayload.assistantContent,
          outer: {
            ...validPayload.assistantContent.outer,
            allArtifactPaths: [1],
          },
        },
      }),
    ).toBe(false)
  })

  it('parses and serializes structured content', () => {
    const raw = JSON.stringify(validPayload)
    expect(parseAssistantStructuredContent(raw)).toEqual(validPayload)
    expect(parseAssistantStructuredContent('{bad json')).toBeNull()
    expect(
      parseAssistantStructuredContent(JSON.stringify({ version: 3 })),
    ).toBeNull()

    const serialized = serializeAssistantMessageForHistory(raw)
    expect(serialized).toContain('Done')
    expect(serialized).toContain('Full report')
    expect(serialized).toContain('Artifact paths:')
  })

  it('parses embedded structured content markers from live progress text', () => {
    const embedded = Buffer.from(
      JSON.stringify({
        version: 2,
        assistantContent: {
          outer: { finalResult: '', report: '', streamingText: 'Working...' },
          subSteps: [
            { type: 'PlanningStep', title: 'Planning', content: 'Plan' },
          ],
        },
      }),
      'utf8',
    ).toString('base64')
    const raw = `- Planning\n\nPlan\n<!-- otter-structured:${embedded} -->`

    expect(parseAssistantStructuredContent(raw)).toEqual({
      version: 2,
      assistantContent: {
        outer: { finalResult: '', report: '', streamingText: 'Working...' },
        subSteps: [
          { type: 'PlanningStep', title: 'Planning', content: 'Plan' },
        ],
      },
    })
  })

  it('falls back to captures and sub-steps when finalResult/report empty', () => {
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '',
          report: '',
          stepCaptures: [
            {
              stepType: 'SummaryStep',
              title: 'Summary',
              content: 'summary body',
              outputPaths: [],
            },
          ],
        },
        subSteps: [
          { type: 'ThinkingStep', title: 'Think', content: 'thoughts' },
        ],
      },
    }
    const raw = JSON.stringify(payload)
    expect(serializeAssistantMessageForHistory(raw)).toContain('summary body')
  })

  it('returns raw string when content is not structured', () => {
    expect(serializeAssistantMessageForHistory('plain text')).toBe('plain text')
  })
})
