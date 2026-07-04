import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isWin } from '@test-paths'
import { createPaperOutputPath } from './paths'

const SANDBOX = isWin ? 'C:\\tmp\\sandbox' : '/tmp/sandbox'

describe('createPaper paths', () => {
  it('writes under sandbox/createPaper/output/', () => {
    expect(createPaperOutputPath(SANDBOX, 'research-report.pdf')).toBe(
      join(SANDBOX, 'createPaper', 'output', 'research-report.pdf'),
    )
  })
})
