import { describe, expect, it } from 'vitest'
import { assistantFallbackMarkdownSource } from './useAssistantStructuredMessageView'

describe('assistantFallbackMarkdownSource', () => {
  it('suppresses empty version-2 structured shells so chat never paints raw JSON', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '',
          report: '',
          allArtifactPaths: [
            '/Users/zhenqili/.teralexi/workspace/sandbox/abc',
            '/Users/zhenqili/.teralexi/workspace/sandbox/abc/output',
          ],
        },
        subSteps: [],
      },
    })
    expect(assistantFallbackMarkdownSource(raw)).toBe('')
  })

  it('still falls back for plain assistant markdown', () => {
    expect(assistantFallbackMarkdownSource('Map updated for San Ramon.')).toBe(
      'Map updated for San Ramon.',
    )
  })
})
