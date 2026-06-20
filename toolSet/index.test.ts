import { describe, expect, it } from 'vitest'
import toolSet, { tools } from './index'

describe('toolSet index', () => {
  it('exports default module with tools array', () => {
    expect(toolSet.tools).toBe(tools)
    expect(tools.length).toBeGreaterThan(0)
    expect(tools.map((t) => t.name)).toContain('read_file')
    expect(tools.map((t) => t.name)).toContain('promote_artifact')
    expect(tools.map((t) => t.name)).toContain('enter_plan_mode')
    expect(tools.map((t) => t.name)).toContain('exit_plan_mode')
    expect(tools.map((t) => t.name)).toContain('invoke_agent')
    expect(tools.map((t) => t.name)).toContain('invoke_agents')
    expect(tools.map((t) => t.name)).toContain('wait_for_sub_agent_runs')
  })
})
