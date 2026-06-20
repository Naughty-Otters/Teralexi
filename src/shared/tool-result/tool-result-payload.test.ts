import { describe, expect, it } from 'vitest'
import {
  deriveToolResultContent,
  enrichToolResultRecord,
  QUERY_TOOL_NAMES,
} from './tool-result-payload'
import { normalizeToolResult } from './normalize-tool-result'
import { formatToolResultForDisplay } from './format-tool-result-for-display'

describe('deriveToolResultContent', () => {
  it('prefers file content over stdout for read_file', () => {
    expect(
      deriveToolResultContent('read_file', {
        content: '1: hello',
        stdout: 'noise',
      }),
    ).toBe('1: hello')
  })

  it('uses matches for grep_files', () => {
    expect(
      deriveToolResultContent('grep_files', { matches: 'src/a.ts:10:foo' }),
    ).toBe('src/a.ts:10:foo')
  })

  it('returns (no matches) for empty grep matches string', () => {
    expect(deriveToolResultContent('grep_files', { matches: '   ' })).toBe(
      '(no matches)',
    )
  })

  it('formats paths as markdown list', () => {
    expect(
      deriveToolResultContent('glob_files', {
        paths: ['src/a.ts', 'src/b.ts'],
      }),
    ).toBe('- `src/a.ts`\n- `src/b.ts`')
  })

  it('formats entries with type metadata', () => {
    expect(
      deriveToolResultContent('list_files', {
        entries: [{ path: 'src', type: 'directory' }, 'README.md'],
      }),
    ).toBe('- `src` (directory)\n- README.md')
  })

  it('formats search results with match snippets', () => {
    expect(
      deriveToolResultContent('search_files', {
        results: [{ path: 'docs/a.md', match: 'needle' }],
      }),
    ).toBe('- `docs/a.md` · needle')
  })

  it('stringifies data objects', () => {
    const text = deriveToolResultContent('storage_check', {
      data: { free: 1024, used: 2048 },
    })
    expect(text).toContain('"free": 1024')
  })

  it('uses summary when no higher-priority fields exist', () => {
    expect(
      deriveToolResultContent('update_todos', { summary: '2/3 done' }),
    ).toBe('2/3 done')
  })

  it('prefers message for query tools even when stdout exists', () => {
    expect(
      deriveToolResultContent('read_file', {
        message: 'File not found',
        stdout: 'ignored transcript',
      }),
    ).toBe('File not found')
  })

  it('strips terminal capture headers from resultContent', () => {
    expect(
      deriveToolResultContent('run_script', {
        resultContent: '--- stdout ---\nhello\n--- stderr ---\nwarn',
      }),
    ).toBe('hello\nwarn')
  })

  it('ignores empty capture markers', () => {
    expect(
      deriveToolResultContent('run_workspace_command', {
        output: '(no stdout/stderr)',
        stdout: 'real output',
      }),
    ).toBe('real output')
  })

  it('uses stdout for github tools when no structured fields', () => {
    expect(
      deriveToolResultContent('github_issue_list', {
        stdout: '#1 open',
        stderr: '',
      }),
    ).toBe('#1 open')
  })

  it('joins stdout and stderr for git tools', () => {
    expect(
      deriveToolResultContent('git_status', {
        stdout: ' M README.md',
        stderr: 'hint: ...',
      }),
    ).toBe('M README.md\n\nhint: ...')
  })

  it('returns null when nothing meaningful is present', () => {
    expect(deriveToolResultContent('write_file', { path: 'a.ts' })).toBeNull()
  })

  it('documents query tool names', () => {
    expect(QUERY_TOOL_NAMES.has('grep_files')).toBe(true)
    expect(QUERY_TOOL_NAMES.has('git_status')).toBe(false)
  })
})

describe('normalizeToolResult enrichment', () => {
  it('stamps resultContent on read_file', () => {
    const out = normalizeToolResult('read_file', {
      content: 'line one',
      path: 'a.txt',
    }) as Record<string, unknown>
    expect(out.resultType).toBe('query')
    expect(out.resultContent).toBe('line one')
  })

  it('stamps resultContent on git_status from stdout', () => {
    const out = normalizeToolResult('git_status', {
      success: true,
      exitCode: 0,
      stdout: ' M README.md',
      stderr: '',
    }) as Record<string, unknown>
    expect(out.resultType).toBe('terminal')
    expect(out.resultContent).toBe('M README.md')
  })
})

describe('formatToolResultForDisplay query and mutations', () => {
  it('formats read_file as query not JSON', () => {
    const text = formatToolResultForDisplay(
      normalizeToolResult('read_file', { content: '1: x', path: 'f.ts' }),
      { toolName: 'read_file' },
    )
    expect(text).toContain('read file')
    expect(text).toContain('1: x')
    expect(text).not.toContain('"content"')
  })

  it('formats delete_file without console noise', () => {
    const text = formatToolResultForDisplay({
      resultType: 'file_change',
      deleted: true,
      path: 'output/old.txt',
      stdout: 'ignored',
    })
    expect(text).toContain('**Deleted**')
    expect(text).toContain('old.txt')
    expect(text).not.toContain('ignored')
  })
})

describe('enrichToolResultRecord', () => {
  it('does not overwrite existing resultContent', () => {
    const out = enrichToolResultRecord('read_file', {
      content: 'new',
      resultContent: 'keep',
    })
    expect(out.resultContent).toBe('keep')
  })

  it('stamps resultContent from derived fields', () => {
    const out = enrichToolResultRecord('glob_files', {
      paths: ['a.ts', 'b.ts'],
    })
    expect(out.resultContent).toBe('- `a.ts`\n- `b.ts`')
  })

  it('returns the same record when no content can be derived', () => {
    const record = { path: 'only-path.ts' }
    expect(enrichToolResultRecord('write_file', record)).toBe(record)
  })
})
