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

  it('returns compact update_todos stub', () => {
    const stub = buildRepeatToolResultStub('update_todos', {
      todos: [{ content: 'Done', status: 'completed' }],
    }) as Record<string, unknown>
    expect(stub.alreadySucceeded).toBe(true)
    expect(stub.tool).toBe('update_todos')
    expect(String(stub.message)).toContain('update_todos')
  })
})
