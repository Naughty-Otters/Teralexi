import { describe, expect, it } from 'vitest'
import { getBundledToolSetTools } from './bundled-toolset'

const CATALOG = [
  'read_file',
  'edit_files',
  'shell',
  'promote_artifact',
  'run_script',
  'run_script_file',
  'read_todos',
  'update_todos',
  'generate_follow_up',
  'enter_plan_mode',
  'exit_plan_mode',
  'invoke_agents',
  'lsp',
  'web_search',
  'web_scrape',
] as const

describe('bundled-toolset', () => {
  it('exports the exact shipped tool catalog', () => {
    const names = getBundledToolSetTools().map((tool) => tool.name).sort()
    expect(names).toEqual([...CATALOG].sort())
  })

  it('includes core shared tools expected by skills and IPC', () => {
    const names = new Set(getBundledToolSetTools().map((tool) => tool.name))
    expect(names.has('read_file')).toBe(true)
    expect(names.has('edit_files')).toBe(true)
    expect(names.has('shell')).toBe(true)
    expect(names.has('run_script')).toBe(true)
    expect(names.has('run_script_file')).toBe(true)
    expect(names.has('web_search')).toBe(true)
    expect(names.has('invoke_agents')).toBe(true)
    expect(names.has('generate_follow_up')).toBe(true)
    expect(names.has('git_status')).toBe(false)
    expect(names.has('best_of_n')).toBe(false)
    // Skill-owned tools must not appear in shipped toolSet.
    expect(names.has('github_auth_status')).toBe(false)
    expect(names.has('google_workspace_auth_status')).toBe(false)
  })

  it('every bundled tool has name, description, and execute', () => {
    for (const tool of getBundledToolSetTools()) {
      expect(typeof tool.name).toBe('string')
      expect(tool.name.length).toBeGreaterThan(0)
      expect(typeof tool.description).toBe('string')
      expect(typeof tool.execute).toBe('function')
    }
  })
})
