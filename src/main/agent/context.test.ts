import { describe, expect, it } from 'vitest'
import {
  cloneStepContextMap,
  cloneStepHistory,
  collectSandboxArtifactPaths,
} from '@main/agent/context'
import {
  isAssistantStructuredContent,
  parseAssistantStructuredContent,
  serializeAssistantMessageForHistory,
} from '@main/agent/utils'

function validStructured() {
  return {
    version: 2,
    assistantContent: {
      outer: {
        finalResult: 'done',
        report: 'report text',
        stepCaptures: [],
        allArtifactPaths: [],
      },
      subSteps: [{ type: 'summary', title: 'S', content: 'c' }],
    },
  }
}

describe('isAssistantStructuredContent', () => {
  it('accepts version 2 structured payloads', () => {
    expect(isAssistantStructuredContent(validStructured())).toBe(true)
  })

  it('rejects invalid shapes', () => {
    expect(isAssistantStructuredContent(null)).toBe(false)
    expect(isAssistantStructuredContent({ version: 1 })).toBe(false)
    expect(
      isAssistantStructuredContent({
        ...validStructured(),
        assistantContent: { outer: {}, subSteps: 'nope' },
      }),
    ).toBe(false)
  })
})

describe('parseAssistantStructuredContent', () => {
  it('parses valid JSON string', () => {
    const parsed = parseAssistantStructuredContent(
      JSON.stringify(validStructured()),
    )
    expect(parsed?.version).toBe(2)
  })

  it('returns null for invalid JSON or shape', () => {
    expect(parseAssistantStructuredContent('not json')).toBeNull()
    expect(parseAssistantStructuredContent('{}')).toBeNull()
  })
})

describe('serializeAssistantMessageForHistory', () => {
  it('returns raw string when not structured', () => {
    expect(serializeAssistantMessageForHistory('plain text')).toBe('plain text')
  })

  it('extracts final result and report from structured content', () => {
    const out = serializeAssistantMessageForHistory(
      JSON.stringify(validStructured()),
    )
    expect(out).toContain('done')
    expect(out).toContain('report text')
  })
})

describe('cloneStepContextMap / cloneStepHistory', () => {
  it('deep-clones step contexts and history', () => {
    const contexts = { planning: { stepId: 'planning' } }
    expect(cloneStepContextMap(contexts as never)).toEqual(contexts)
    expect(cloneStepHistory([{ stepId: 'a' }] as never)).toEqual([
      { stepId: 'a' },
    ])
  })
})

describe('collectSandboxArtifactPaths', () => {
  it('returns empty when sandbox missing', () => {
    expect(collectSandboxArtifactPaths(undefined)).toEqual([])
  })

  it('collects layout paths', () => {
    const paths = collectSandboxArtifactPaths({
      layout: {
        root: '/sandbox',
        outputDir: '/sandbox/output',
        refsDir: '/sandbox/refs',
        scriptsDir: '/sandbox/scripts',
      },
    } as never)
    expect(paths).toContain('/sandbox')
    expect(paths).toContain('/sandbox/output/results')
    expect(paths).toContain('/sandbox/output/toolLoop')
  })
})
