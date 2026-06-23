import { describe, expect, it } from 'vitest'
import { isCaptureArtifactPath } from './capture-artifact-path'

describe('isCaptureArtifactPath', () => {
  it('matches capture-*.txt under any directory', () => {
    expect(
      isCaptureArtifactPath('/sandbox/output/toolLoop/x/results/capture-1.txt'),
    ).toBe(true)
    expect(isCaptureArtifactPath('capture-1730123456-abcd.txt')).toBe(true)
  })

  it('does not match deliverables or unrelated files', () => {
    expect(isCaptureArtifactPath('/sandbox/output/results/report.md')).toBe(false)
    expect(isCaptureArtifactPath('/sandbox/output/plot.png')).toBe(false)
    expect(isCaptureArtifactPath('/sandbox/output/capture-notes.md')).toBe(false)
  })
})
