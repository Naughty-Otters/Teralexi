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
        'edit_files',
        'update_todos',
        'read_todos',
        'shell',
      ],
      true,
      'conv-1',
    )
    expect(names).toContain('read_file')
    expect(names).toContain('edit_files')
    expect(names).toContain('update_todos')
    expect(names).toContain('read_todos')
    expect(names).not.toContain('shell')
  })

  it('blocks shell and sub-agents during plan mode', () => {
    const names = resolvePlanModeActiveToolNames(
      [
        'read_file',
        'shell',
        'invoke_agents',
        'delegate_subagent',
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
        'lsp',
        'read_file',
        'shell',
      ],
      true,
      'conv-1',
    )
    expect(names).toEqual([
      'web_search',
      'web_scrape',
      'lsp',
      'read_file',
    ])
  })

  it('passes through all tools when plan mode is inactive', () => {
    isPlanModeActive.mockReturnValue(false)
    const names = resolvePlanModeActiveToolNames(
      ['read_file', 'shell', 'update_todos'],
      true,
      'conv-1',
    )
    expect(names).toEqual(['read_file', 'shell', 'update_todos'])
  })

  it('respects root and non-root allowlist checks', () => {
    expect(isPlanModeAllowedToolName('read_file', false)).toBe(true)
    expect(isPlanModeAllowedToolName('enter_plan_mode', false)).toBe(false)
    expect(isPlanModeAllowedToolName('enter_plan_mode', true)).toBe(true)
  })
})
