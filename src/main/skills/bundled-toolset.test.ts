import { describe, expect, it } from 'vitest'
import { getBundledToolSetTools } from './bundled-toolset'

describe('bundled-toolset', () => {
  it('exports a non-empty shipped tool catalog', () => {
    const tools = getBundledToolSetTools()
    expect(tools.length).toBeGreaterThan(10)
  })

  it('includes core shared tools expected by skills and IPC', () => {
    const names = new Set(getBundledToolSetTools().map((tool) => tool.name))
    expect(names.has('read_file')).toBe(true)
    expect(names.has('git_status')).toBe(true)
    expect(names.has('web_search')).toBe(true)
    expect(names.has('run_script')).toBe(true)
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
