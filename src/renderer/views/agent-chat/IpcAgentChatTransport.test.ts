import { describe, expect, it } from 'vitest'
import { shouldInjectAssistantFinalContent } from './IpcAgentChatTransport'

describe('shouldInjectAssistantFinalContent', () => {
  it('skips empty version-2 shells so the stream can finish without UI dump', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '',
          report: '',
          allArtifactPaths: [
            '/tmp/sandbox',
            '/tmp/sandbox/output',
            '/tmp/sandbox/output/results',
          ],
        },
        subSteps: [],
      },
    })
    expect(shouldInjectAssistantFinalContent(raw)).toBe(false)
  })

  it('still injects structured content that has user-facing text', () => {
    const raw = JSON.stringify({
      version: 2,
      assistantContent: {
        outer: { finalResult: 'Map set to San Ramon.', report: '' },
        subSteps: [],
      },
    })
    expect(shouldInjectAssistantFinalContent(raw)).toBe(true)
  })

  it('injects plain assistant text', () => {
    expect(shouldInjectAssistantFinalContent('Hello')).toBe(true)
  })

  it('skips blank content', () => {
    expect(shouldInjectAssistantFinalContent('   ')).toBe(false)
  })
})
