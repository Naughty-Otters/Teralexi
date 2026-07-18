import { describe, expect, it } from 'vitest'
import { loadToolSetTools } from '@main/skills/skill-module-loader'

describe('loadToolSetTools sub-agents', () => {
  it('includes sub-agent delegation tools from the static bundled catalog', async () => {
    const tools = await loadToolSetTools()
    const names = new Set(tools.map((t) => t.name))
    expect(names.has('enter_plan_mode')).toBe(true)
    expect(names.has('invoke_agent')).toBe(true)
    expect(names.has('invoke_agents')).toBe(true)
    expect(names.has('wait_for_sub_agent_runs')).toBe(true)
    expect(names.has('best_of_n')).toBe(true)
  })
})
