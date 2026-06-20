import { describe, expect, it } from 'vitest'
import {
  extractTerminalTextFromResult,
  formatToolResultForDisplay,
  stripTerminalCaptureHeaders,
} from './format-tool-result-for-display'

describe('formatToolResultForDisplay', () => {
  it('formats terminal run_script output without raw JSON metadata', () => {
    const text = formatToolResultForDisplay({
      success: true,
      resultType: 'terminal',
      captureAbsolutePath: '/sandbox/output/capture.txt',
      resultContent:
        '--- stdout ---\n14:31 up 24 days, 4:43, 2 users, load averages: 12.83 13.13 16.54',
      referencedScriptFiles: [],
      pathIsRelativeTo: 'sandbox_root',
    })
    expect(text).toContain('**Terminal**')
    expect(text).toContain('14:31 up 24 days')
    expect(text).not.toContain('captureAbsolutePath')
    expect(text).not.toContain('resultType')
  })

  it('formats file_change as a bullet list', () => {
    const text = formatToolResultForDisplay({
      resultType: 'file_change',
      files: [
        {
          path: 'src/a.ts',
          diff: 'Index: a.ts\n--- a.ts\n+++ a.ts\n@@ -1 +1 @@\n-old\n+new',
          additions: 1,
          deletions: 1,
          action: 'modify',
        },
      ],
    })
    expect(text).toContain('**File changes**')
    expect(text).toContain('`src/a.ts`')
    expect(text).not.toContain('Index: a.ts')
  })
})

describe('stripTerminalCaptureHeaders', () => {
  it('removes stdout/stderr banners', () => {
    expect(
      stripTerminalCaptureHeaders('--- stdout ---\nhello\n--- stderr ---\nwarn'),
    ).toBe('hello\nwarn')
  })
})

describe('extractTerminalTextFromResult', () => {
  it('prefers capture resultContent over live stdout', () => {
    expect(
      extractTerminalTextFromResult({
        stdout: 'live console only',
        resultContent: '--- stdout ---\nfrom capture file',
      }),
    ).toBe('from capture file')
  })

  it('falls back to stdout when capture is empty', () => {
    expect(
      extractTerminalTextFromResult({
        stdout: 'console fallback',
        resultContent: '(no stdout/stderr)',
      }),
    ).toBe('console fallback')
  })
})

describe('formatToolResultForDisplay priority', () => {
  it('prefers file changes over terminal stdout', () => {
    const text = formatToolResultForDisplay({
      resultType: 'terminal',
      stdout: 'noise',
      files: [
        {
          path: 'out.txt',
          diff: 'Index: out.txt\n--- out.txt\n+++ out.txt\n@@ -0,0 +1 @@\n+hi',
          additions: 1,
          deletions: 0,
          action: 'create',
        },
      ],
    })
    expect(text).toContain('**File changes**')
    expect(text).not.toContain('noise')
  })

  it('formats query tools without raw JSON', () => {
    const text = formatToolResultForDisplay(
      { resultType: 'query', resultContent: '1: hello\n2: world', path: 'a.ts' },
      { toolName: 'read_file' },
    )
    expect(text).toContain('read file')
    expect(text).toContain('1: hello')
    expect(text).not.toContain('"resultContent"')
  })

  it('truncates long query output to a short preview', () => {
    const longBody = 'a'.repeat(250)
    const text = formatToolResultForDisplay(
      { resultType: 'query', resultContent: longBody, path: 'big.ts' },
      { toolName: 'read_file' },
    )
    expect(text).toContain('read file')
    expect(text).toContain('a'.repeat(100))
    expect(text).toContain('…[truncated 150 chars]')
    expect(text).not.toContain('a'.repeat(101))
  })

  it('includes tool call params in query headers', () => {
    const text = formatToolResultForDisplay(
      {
        resultType: 'query',
        entries: [{ path: 'src', type: 'directory' }],
      },
      {
        toolName: 'list_files',
        toolInput: { path: 'src', recursive: true, maxDepth: 2 },
      },
    )
    expect(text).toContain('**list files** · path=src, recursive=true, maxDepth=2')
    expect(text).toContain('`src` (directory)')
  })

  it('shows written path when there is no diff', () => {
    const text = formatToolResultForDisplay({
      written: true,
      path: 'output/results/report.md',
      stdout: 'wrote file',
    })
    expect(text).toContain('**Output file**')
    expect(text).toContain('report.md')
    expect(text).not.toContain('wrote file')
  })

  it('shows script deliverable and preview over empty terminal', () => {
    const text = formatToolResultForDisplay(
      {
        success: true,
        stdout: '',
        artifacts: [
          {
            role: 'primary',
            path: '/sandbox/output/toolLoop/s/results/out.md',
            relPath: 'output/toolLoop/s/results/out.md',
          },
        ],
        resultContent: '# Report\n\nBody text.',
      },
      { toolName: 'run_script' },
    )
    expect(text).toContain('**Script deliverable**')
    expect(text).toContain('out.md')
    expect(text).toContain('# Report')
    expect(text).not.toContain('**Terminal**')
  })

  it('formats preflight failures without executing', () => {
    const text = formatToolResultForDisplay({
      success: false,
      phase: 'preflight',
      issues: [{ code: 'syntax', message: 'unexpected EOF' }],
    })
    expect(text).toContain('**Preflight failed**')
    expect(text).toContain('syntax')
    expect(text).toContain('unexpected EOF')
  })
})

describe('formatToolResultForDisplay edge cases', () => {
  it('returns empty string for nullish values and passes through strings', () => {
    expect(formatToolResultForDisplay(null)).toBe('')
    expect(formatToolResultForDisplay(undefined)).toBe('')
    expect(formatToolResultForDisplay('plain text')).toBe('plain text')
    expect(formatToolResultForDisplay([1, 2])).toContain('1')
  })

  it('formats patch, delete, move, and copy impacts', () => {
    expect(formatToolResultForDisplay({ applied: true, path: 'src/a.ts' })).toContain(
      '**Patch applied**',
    )
    expect(formatToolResultForDisplay({ applied: true })).toBe('**Patch applied**')
    expect(formatToolResultForDisplay({ deleted: true, path: 'old.txt' })).toContain(
      '**Deleted**',
    )
    expect(formatToolResultForDisplay({ deleted: true })).toBe('**Deleted**')
    expect(
      formatToolResultForDisplay({ moved: true, from: 'a.txt', to: 'b.txt' }),
    ).toContain('`a.txt` → `b.txt`')
    expect(formatToolResultForDisplay({ moved: true })).toBe('**Moved**')
    expect(
      formatToolResultForDisplay({ copied: true, from: 'a.txt', to: 'b.txt' }),
    ).toContain('**Copied**')
  })

  it('lists output files without diffs and script sidecars', () => {
    const filesOnly = formatToolResultForDisplay({
      files: [{ path: 'out/a.txt' }, { path: 'out/b.txt' }],
    })
    expect(filesOnly).toContain('**Output files**')
    expect(filesOnly).toContain('`out/a.txt`')

    const sidecars = formatToolResultForDisplay({
      artifacts: [
        { role: 'sidecar', relPath: 'output/results/extra.json' },
        { role: 'script', path: 'ignored.sh' },
      ],
      resultContent: 'single-line',
    })
    expect(sidecars).toContain('**Script output files**')
    expect(sidecars).toContain('extra.json')
    expect(sidecars).toContain('single-line')
    expect(sidecars).not.toContain('```')
  })

  it('formats terminal stderr, exit codes, and empty output errors', () => {
    const stderr = formatToolResultForDisplay({
      resultType: 'terminal',
      stderr: 'warn',
      success: false,
    })
    expect(stderr).toContain('**Terminal** (exit 1)')
    expect(stderr).toContain('warn')

    const empty = formatToolResultForDisplay({
      resultType: 'terminal',
      error: 'command failed',
    })
    expect(empty).toContain('command failed')

    const noOutput = formatToolResultForDisplay({ resultType: 'terminal' })
    expect(noOutput).toContain('_(no output)_')
  })

  it('formats todos and query errors', () => {
    const todos = formatToolResultForDisplay({
      resultType: 'todo',
      todos: [
        { status: 'completed', content: 'Done' },
        { status: 'cancelled', title: 'Skip' },
        { status: 'pending', content: 'Next' },
      ],
    })
    expect(todos).toContain('[x] Done')
    expect(todos).toContain('[~] Skip')
    expect(todos).toContain('[ ] Next')

    const emptyTodos = formatToolResultForDisplay({ resultType: 'todo', todos: [] })
    expect(emptyTodos).toContain('_(empty)_')

    const queryErr = formatToolResultForDisplay(
      { resultType: 'query', error: 'not found' },
      { toolName: 'grep_files' },
    )
    expect(queryErr).toContain('grep files')
    expect(queryErr).toContain('not found')
  })

  it('formats rename diffs, file-change failures, and generic errors', () => {
    const rename = formatToolResultForDisplay({
      files: [
        {
          path: 'new.ts',
          moveFrom: 'old.ts',
          action: 'rename',
          diff: 'Index: new.ts\n--- old.ts\n+++ new.ts\n@@ -1 +1 @@\n-a\n+b',
          additions: 1,
          deletions: 1,
        },
      ],
    })
    expect(rename).toContain('`new.ts`')
    expect(rename).toContain('← old.ts')

    const failed = formatToolResultForDisplay({
      resultType: 'file_change',
      error: 'patch rejected',
    })
    expect(failed).toContain('**File change failed**')

    const generic = formatToolResultForDisplay({
      resultType: 'error',
      message: 'boom',
    })
    expect(generic).toContain('**Error**')
    expect(generic).toContain('boom')

    const preflightEmpty = formatToolResultForDisplay({
      resultType: 'error',
      phase: 'preflight',
      issues: [],
    })
    expect(preflightEmpty).toContain('Script was not executed')
  })

  it('falls back to JSON for unknown result types and truncates large payloads', () => {
    const raw = formatToolResultForDisplay({ resultType: 'unknown', foo: 'bar' })
    expect(raw).toContain('"foo"')

    const huge = formatToolResultForDisplay({
      resultType: 'unknown',
      blob: 'x'.repeat(9_000),
    })
    expect(huge).toContain('…[truncated]')
  })

  it('extracts terminal text from output field and combined stderr', () => {
    expect(
      extractTerminalTextFromResult({
        output: '--- stdout ---\ncaptured output',
      }),
    ).toBe('captured output')

    expect(
      extractTerminalTextFromResult({
        stdout: 'line1',
        stderr: 'line2',
      }),
    ).toBe('line1\n\nline2')
  })
})
