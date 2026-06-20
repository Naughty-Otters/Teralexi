import { describe, expect, it } from 'vitest'
import { buildSandboxReadyPayload } from './ready-payload'

describe('buildSandboxReadyPayload', () => {
  it('builds file URL with trailing slash', () => {
    const payload = buildSandboxReadyPayload({
      conversationId: 'c1',
      sandboxRoot: '/tmp/sb',
      outputResultsDir: '/tmp/sb/output/results',
    })
    expect(payload.conversationId).toBe('c1')
    expect(payload.sandboxRoot).toBe('/tmp/sb')
    expect(payload.resultsFileUrl.endsWith('/')).toBe(true)
    expect(payload.resultsFileUrl).toContain('results')
  })

  it('defaults conversationId to empty string', () => {
    const payload = buildSandboxReadyPayload({
      sandboxRoot: '/sb',
      outputResultsDir: '/sb/out',
    })
    expect(payload.conversationId).toBe('')
  })
})
