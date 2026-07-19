import { describe, expect, it } from 'vitest'
import {
  releaseSandboxPreviewSuppress,
  sandboxPreviewSuppressed,
  suppressSandboxPreview,
} from './sandboxPreviewSuppress'

describe('sandboxPreviewSuppress', () => {
  it('ref-counts suppress / release', () => {
    expect(sandboxPreviewSuppressed.value).toBe(false)
    suppressSandboxPreview()
    expect(sandboxPreviewSuppressed.value).toBe(true)
    suppressSandboxPreview()
    expect(sandboxPreviewSuppressed.value).toBe(true)
    releaseSandboxPreviewSuppress()
    expect(sandboxPreviewSuppressed.value).toBe(true)
    releaseSandboxPreviewSuppress()
    expect(sandboxPreviewSuppressed.value).toBe(false)
  })

  it('does not go negative on extra release', () => {
    releaseSandboxPreviewSuppress()
    expect(sandboxPreviewSuppressed.value).toBe(false)
  })
})
