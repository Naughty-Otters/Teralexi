import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  isPlanModeAllowedToolName,
  resolvePlanModeActiveToolNames,
} from './plan-mode-active-tools'

const { isPlanModeActive } = vi.hoisted(() => ({
  isPlanModeActive: vi.fn(() => true),
}))

vi.mock('./plan-mode-state', () => ({
  isPlanModeActive,
}))

describe('resolvePlanModeActiveToolNames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows update_todos and read_todos during plan mode', () => {
    const names = resolvePlanModeActiveToolNames(
      [
        'read_file',
        'write_file',
        'update_todos',
        'read_todos',
        'run_workspace_command',
      ],
      true,
      'conv-1',
    )
    expect(names).toContain('read_file')
    expect(names).toContain('write_file')
    expect(names).toContain('update_todos')
    expect(names).toContain('read_todos')
    expect(names).not.toContain('run_workspace_command')
  })

  it('blocks run_script and sub-agents during plan mode', () => {
    const names = resolvePlanModeActiveToolNames(
      [
        'read_file',
        'run_script',
        'run_script_file',
        'delegate_subagent',
        'dispatch_subagent',
      ],
      true,
      'conv-1',
    )
    expect(names).toEqual(['read_file'])
  })

  it('allows web research and file IO tools during plan mode', () => {
    const names = resolvePlanModeActiveToolNames(
      [
        'web_search',
        'web_scrape',
        'deep_research',
        'grep_files',
        'search_files',
        'storage_check',
        'run_workspace_command',
      ],
      true,
      'conv-1',
    )
    expect(names).toEqual([
      'web_search',
      'web_scrape',
      'deep_research',
      'grep_files',
      'search_files',
      'storage_check',
    ])
  })

  it('passes through all tools when plan mode is inactive', () => {
    isPlanModeActive.mockReturnValue(false)
    const names = resolvePlanModeActiveToolNames(
      ['read_file', 'run_script', 'update_todos'],
      true,
      'conv-1',
    )
    expect(names).toEqual(['read_file', 'run_script', 'update_todos'])
  })

  it('respects root and non-root allowlist checks', () => {
    expect(isPlanModeAllowedToolName('read_file', false)).toBe(true)
    expect(isPlanModeAllowedToolName('enter_plan_mode', false)).toBe(false)
    expect(isPlanModeAllowedToolName('enter_plan_mode', true)).toBe(true)
  })
})
