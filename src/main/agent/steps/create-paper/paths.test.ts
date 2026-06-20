import { describe, expect, it } from 'vitest'
import { createPaperOutputPath } from './paths'

describe('createPaper paths', () => {
  it('writes under sandbox/createPaper/output/', () => {
    expect(createPaperOutputPath('/tmp/sandbox', 'research-report.pdf')).toBe(
      '/tmp/sandbox/createPaper/output/research-report.pdf',
    )
  })
})
