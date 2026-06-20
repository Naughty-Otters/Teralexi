import { describe, expect, it } from 'vitest'
import { inferToolResultType } from './infer-tool-result-type'

describe('inferToolResultType', () => {
  it('classifies non-object terminal tools as terminal', () => {
    expect(inferToolResultType('run_script', null)).toBe('terminal')
    expect(inferToolResultType('unknown_tool', 'text')).toBe('raw')
  })

  it('detects preflight and bare errors', () => {
    expect(
      inferToolResultType('run_script', {
        phase: 'preflight',
        issues: [{ code: 'syntax', message: 'bad' }],
      }),
    ).toBe('error')
    expect(inferToolResultType('read_file', { error: 'missing' })).toBe('error')
  })

  it('keeps errors with payloads on their primary shape', () => {
    expect(
      inferToolResultType('run_script', { error: 'partial', stdout: 'data' }),
    ).toBe('terminal')
    expect(
      inferToolResultType('edit_file', {
        error: 'warn',
        diff: '--- a\n+++ b',
      }),
    ).toBe('file_change')
  })

  it('classifies file, todo, query, and terminal results', () => {
    expect(inferToolResultType('write_file', { written: true })).toBe(
      'file_change',
    )
    expect(inferToolResultType('update_todos', { todos: [] })).toBe('todo')
    expect(inferToolResultType('grep_files', { matches: 'a:1' })).toBe('query')
    expect(inferToolResultType('git_status', { stdout: 'ok' })).toBe('terminal')
    expect(inferToolResultType('custom', { output: 'x' })).toBe('terminal')
    expect(inferToolResultType('custom', { foo: 1 })).toBe('raw')
    expect(inferToolResultType('promote_artifact', { promoted: true })).toBe(
      'file_change',
    )
    expect(inferToolResultType('read_file', { content: 'hello' })).toBe('query')
    expect(inferToolResultType('github_create_pr', { stderr: 'denied' })).toBe(
      'terminal',
    )
    expect(inferToolResultType('move_file', { moved: true })).toBe('file_change')
    expect(inferToolResultType('list_files', { entries: [] })).toBe('query')
    expect(inferToolResultType('read_file', { error: 'x', content: 'body' })).toBe(
      'error',
    )
  })
})
