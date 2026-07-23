import { describe, expect, it } from 'vitest'
import {
  formatToolHumanReadableAction,
  formatToolHumanReadableParams,
} from './tool-human-readable'

describe('formatToolHumanReadableAction', () => {
  it('describes list_files with folder path', () => {
    expect(
      formatToolHumanReadableAction('list_files', { path: 'src/components' }),
    ).toBe('Browse files in folder `src/components`')
  })

  it('describes search_files with query and folder', () => {
    expect(
      formatToolHumanReadableAction('search_files', {
        path: 'src',
        query: 'MonitorPanel',
      }),
    ).toBe('Search for "MonitorPanel" in `src`')
  })

  it('describes read_file', () => {
    expect(
      formatToolHumanReadableAction('read_file', { path: 'README.md' }),
    ).toBe('Read file `README.md`')
  })

  it('describes git commit with message', () => {
    expect(
      formatToolHumanReadableAction('git_commit', {
        message: 'Fix panel layout',
      }),
    ).toBe('Commit changes: "Fix panel layout"')
  })

  it('falls back for unknown tools', () => {
    expect(formatToolHumanReadableAction('custom_tool', { foo: 'bar' })).toContain(
      'custom tool',
    )
  })

  it('describes web_search and web_scrape', () => {
    expect(
      formatToolHumanReadableAction('web_search', { query: 'vitest mocks' }),
    ).toBe('Search the web for "vitest mocks"')
    expect(
      formatToolHumanReadableAction('web_scrape', {
        url: 'https://example.com/docs',
      }),
    ).toBe('Read page "https://example.com/docs"')
  })

  it('describes move_file with from and to paths', () => {
    expect(
      formatToolHumanReadableAction('move_file', {
        from: 'src/old.ts',
        to: 'src/new.ts',
      }),
    ).toBe('Move `src/old.ts` to `src/new.ts`')
  })

  it('describes grep_files and glob_files', () => {
    expect(
      formatToolHumanReadableAction('grep_files', {
        path: 'src',
        pattern: 'TODO',
      }),
    ).toBe('Search code for "TODO" in `src`')
    expect(
      formatToolHumanReadableAction('glob_files', { pattern: '**/*.test.ts' }),
    ).toBe('Find files matching "**/*.test.ts"')
  })

  it('describes workspace commands and plan mode tools', () => {
    expect(
      formatToolHumanReadableAction('shell', {
        command: ['npm', 'test'],
      }),
    ).toBe('Run command "npm test"')
    expect(formatToolHumanReadableAction('enter_plan_mode')).toBe(
      'Start planning',
    )
    expect(formatToolHumanReadableAction('exit_plan_mode')).toBe(
      'Finish planning',
    )
  })

  it('describes common git actions', () => {
    expect(formatToolHumanReadableAction('git_status')).toBe(
      'Check repository status',
    )
    expect(
      formatToolHumanReadableAction('git_branch', {
        action: 'create',
        branch: 'feature/auth',
      }),
    ).toBe('create branch `feature/auth`')
    expect(
      formatToolHumanReadableAction('git_clone', {
        url: 'https://github.com/org/repo.git',
      }),
    ).toBe('Clone repository "https://github.com/org/repo.git"')
  })

  it('truncates very long quoted values', () => {
    const long = 'x'.repeat(120)
    const action = formatToolHumanReadableAction('web_search', { query: long })
    expect(action).toContain('…')
    expect(action.length).toBeLessThan(long.length + 30)
  })
})

describe('formatToolHumanReadableParams', () => {
  it('returns summarizeToolInput output', () => {
    expect(
      formatToolHumanReadableParams('grep_files', {
        path: 'src',
        pattern: 'TODO',
      }),
    ).toContain('path=src')
    expect(
      formatToolHumanReadableParams('grep_files', {
        path: 'src',
        pattern: 'TODO',
      }),
    ).toContain('pattern=TODO')
  })

  it('returns tool name when input is empty', () => {
    expect(formatToolHumanReadableParams('grep_files', undefined)).toBe(
      'grep files',
    )
  })
})
