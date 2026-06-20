import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { loadToolSetTools, loadToolSetToolsFromDirectory } from '@main/skills/skill-module-loader'

describe('loadToolSetTools sub-agents', () => {
  it('includes sub-agent delegation tools', async () => {
    const toolSetDir = join(process.cwd(), 'toolSet')
    const fromDir = await loadToolSetToolsFromDirectory(toolSetDir)
    const fromDirNames = fromDir.map((t) => t.name)
    expect(fromDirNames).toContain('enter_plan_mode')
    expect(fromDirNames).toContain('invoke_agent')

    const tools = await loadToolSetTools()
    const names = new Set(tools.map((t) => t.name))
    expect(names.has('enter_plan_mode')).toBe(true)
    expect(names.has('invoke_agent')).toBe(true)
    expect(names.has('invoke_agents')).toBe(true)
    expect(names.has('wait_for_sub_agent_runs')).toBe(true)
  })
})
