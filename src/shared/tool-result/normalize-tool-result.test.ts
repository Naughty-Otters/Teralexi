import { describe, expect, it } from 'vitest'
import { normalizeToolResult } from './normalize-tool-result'
import { inferToolResultType } from './infer-tool-result-type'

describe('normalizeToolResult', () => {
  it('stamps resultType and lifts legacy file-change fields into files[]', () => {
    const out = normalizeToolResult('edit_file', {
      written: true,
      path: '/ws/src/a.ts',
      workspacePath: '/ws',
      diff: 'Index: a.ts\n--- a.ts\n+++ a.ts\n@@ -1 +1 @@\n-old\n+new',
      additions: 1,
      deletions: 1,
    }) as Record<string, unknown>

    expect(out.resultType).toBe('file_change')
    expect(Array.isArray(out.files)).toBe(true)
    expect((out.files as unknown[]).length).toBeGreaterThan(0)
  })

  it('stamps terminal results with resultContent', () => {
    const out = normalizeToolResult('run_workspace_command', {
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    }) as Record<string, unknown>
    expect(out.resultType).toBe('terminal')
    expect(out.resultContent).toBe('ok')
  })

  it('stamps todo results', () => {
    const out = normalizeToolResult('update_todos', {
      todos: [{ id: '1', content: 'x', status: 'pending' }],
    }) as Record<string, unknown>
    expect(out.resultType).toBe('todo')
  })

  it('leaves string results unchanged', () => {
    expect(normalizeToolResult('bash', 'line1\nline2')).toBe('line1\nline2')
  })

  it('stamps error-only payloads', () => {
    const out = normalizeToolResult('read_file', {
      error: 'ENOENT',
    }) as Record<string, unknown>
    expect(out.resultType).toBe('error')
  })
})

describe('inferToolResultType', () => {
  it('matches classify expectations for mixed shapes', () => {
    expect(inferToolResultType('grep_files', { matches: '' })).toBe('query')
    expect(inferToolResultType('github_issue_list', { stdout: 'x', exitCode: 0 })).toBe(
      'terminal',
    )
    expect(inferToolResultType('git_status', { stdout: ' M a', exitCode: 0 })).toBe(
      'terminal',
    )
  })
})
