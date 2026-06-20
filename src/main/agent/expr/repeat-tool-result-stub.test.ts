import { describe, expect, it } from 'vitest'
import { buildRepeatToolResultStub } from './repeat-tool-result-stub'

describe('buildRepeatToolResultStub', () => {
  it('returns compact read_file stub', () => {
    const stub = buildRepeatToolResultStub(
      'read_file',
      { path: 'src/a.ts' },
      { sandboxRoot: '/proj', workspacePath: '/proj' },
    ) as Record<string, unknown>
    expect(stub.alreadyRead).toBe(true)
    expect(stub.content).toBe('')
    expect(String(stub.message)).toContain('read_file')
  })

  it('returns compact grep_files stub', () => {
    const stub = buildRepeatToolResultStub('grep_files', {
      pattern: 'foo',
      path: '.',
    }) as Record<string, unknown>
    expect(stub.alreadySearched).toBe(true)
    expect(stub.matches).toEqual([])
  })
})
