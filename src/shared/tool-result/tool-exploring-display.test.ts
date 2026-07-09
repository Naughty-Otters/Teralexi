import { describe, expect, it } from 'vitest'
import {
  formatToolExploringDetails,
  formatToolExploringCommand,
  formatToolExploringResult,
} from './tool-exploring-display'

describe('formatToolExploringDetails', () => {
  it('uses friendly labels instead of key=value', () => {
    expect(
      formatToolExploringDetails('search_files', {
        path: 'src/components',
        query: 'MonitorPanel',
      }),
    ).toEqual([
      { label: 'Folder', value: 'src/components' },
      { label: 'Search for', value: 'MonitorPanel' },
    ])
  })

  it('formats booleans as yes/no', () => {
    expect(
      formatToolExploringDetails('list_files', {
        path: 'src',
        recursive: true,
      }),
    ).toContainEqual({ label: 'Include subfolders', value: 'Yes' })
  })
})

describe('formatToolExploringResult', () => {
  it('summarizes list_files entries as bullets', () => {
    const result = formatToolExploringResult('list_files', { path: 'src' }, {
      entries: [
        { name: 'App.vue', type: 'file' },
        { name: 'components', type: 'directory' },
      ],
    })
    expect(result?.headline).toBe('Found 2 items')
    expect(result?.bullets).toEqual(['App.vue', 'components/'])
  })

  it('summarizes file changes in plain language', () => {
    const result = formatToolExploringResult(
      'edit_file',
      { path: 'src/a.ts' },
      {
        files: [
          {
            path: 'src/a.ts',
            diff: '@@',
            additions: 3,
            deletions: 1,
            action: 'modify',
          },
        ],
      },
    )
    expect(result?.headline).toContain('1 file')
    expect(result?.bullets?.[0]).toContain('Updated')
    expect(result?.bullets?.[0]).toContain('3 added')
  })

  it('turns markdown fallback into prose', () => {
    const result = formatToolExploringResult(
      'custom_tool',
      {},
      null,
      '**Search results**\n\n- First hit\n- Second hit',
    )
    expect(result?.headline).toBe('Search results')
    expect(result?.bullets).toEqual(['First hit', 'Second hit'])
  })
})

describe('formatToolExploringCommand', () => {
  it('formats workspace command arrays', () => {
    expect(
      formatToolExploringCommand({ command: ['git', 'status', '--short'] }),
    ).toBe('git status --short')
  })

  it('formats script relative paths', () => {
    expect(
      formatToolExploringCommand({ scriptRelativePath: 'scripts/build.ts' }),
    ).toBe('scripts/build.ts')
  })
})

describe('formatToolExploringResult extras', () => {
  it('summarizes read_file output', () => {
    const result = formatToolExploringResult('read_file', { path: 'src/a.ts' }, {
      content: 'line one\nline two\nline three',
    })
    expect(result?.headline).toBe('Read 3 lines')
    expect(result?.note).toContain('line one')
  })

  it('surfaces terminal errors', () => {
    const result = formatToolExploringResult(
      'run_workspace_command',
      { command: 'npm test' },
      { success: false, exitCode: 1, error: 'Tests failed' },
    )
    expect(result?.headline).toBe('Command finished with code 1')
    expect(result?.note).toBe('Tests failed')
  })
})
