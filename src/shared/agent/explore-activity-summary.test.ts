import { describe, expect, it } from 'vitest'
import {
  countExploreActivity,
  formatExploreActivityStatus,
  shellExploreRowLabel,
} from './explore-activity-summary'

describe('explore-activity-summary', () => {
  it('counts unique file paths across tool invocations', () => {
    expect(
      countExploreActivity([
        { toolName: 'read_file', input: { path: 'a.ts' } },
        { toolName: 'read_file', input: { path: 'a.ts' } },
        { toolName: 'read_file', input: { path: 'b.ts' } },
        { toolName: 'shell', input: { command: 'rg foo' } },
      ]),
    ).toEqual({ toolCount: 4, fileCount: 2 })
  })

  it('formats Cursor-like exploring status', () => {
    expect(
      formatExploreActivityStatus({ live: true, toolCount: 0, fileCount: 0 }),
    ).toBe('Looking around…')
    expect(
      formatExploreActivityStatus({ live: true, toolCount: 3, fileCount: 2 }),
    ).toBe('Exploring 2 files…')
    expect(
      formatExploreActivityStatus({ live: false, toolCount: 3, fileCount: 2 }),
    ).toBe('Explored 2 files')
    expect(
      formatExploreActivityStatus({ live: false, toolCount: 3, fileCount: 0 }),
    ).toBe('3 tools')
  })

  it('labels rg/find shell commands like Grep/Glob', () => {
    expect(shellExploreRowLabel('rg -n Auth src')).toEqual({
      kind: 'Grep',
      detail: expect.stringContaining('Auth'),
    })
    expect(shellExploreRowLabel('find . -name "*.ts"')?.kind).toBe('Glob')
    expect(shellExploreRowLabel('npm test')?.kind).toBe('Shell')
  })
})
