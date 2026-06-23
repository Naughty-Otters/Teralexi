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
})
