import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadSkillActionsForSkillId = vi.fn()
const loadToolSetTools = vi.fn()

vi.mock('@main/skills/skill-module-loader', () => ({
  loadSkillActionsForSkillId: (...args: unknown[]) =>
    loadSkillActionsForSkillId(...args),
  loadToolSetTools: (...args: unknown[]) => loadToolSetTools(...args),
}))

import {
  clearExecutableToolRegistry,
  getExecutableTool,
} from '@main/skills/executable-tool-registry'

describe('executable tool registry', () => {
  beforeEach(() => {
    clearExecutableToolRegistry()
    loadSkillActionsForSkillId.mockReset()
    loadToolSetTools.mockReset()
  })

  it('loads a skill tool once and serves later calls from cache', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    loadSkillActionsForSkillId.mockResolvedValue([
      {
        name: 'read_file',
        description: 'Read a file',
        inputSchema: {},
        execute,
      },
    ])

    const first = await getExecutableTool('coding', 'read_file')
    const second = await getExecutableTool('coding', 'read_file')

    expect(first).toBe(second)
    expect(loadSkillActionsForSkillId).toHaveBeenCalledTimes(1)
    expect(loadToolSetTools).not.toHaveBeenCalled()
  })

  it('falls back to toolSet catalog when skill has no matching tool', async () => {
    loadSkillActionsForSkillId.mockResolvedValue([])
    const execute = vi.fn(async () => ({ ok: true }))
    loadToolSetTools.mockResolvedValue([
      {
        name: 'shell',
        description: 'Run a command',
        inputSchema: {},
        execute,
      },
    ])

    const tool = await getExecutableTool('coding', 'shell')
    expect(tool.name).toBe('shell')
    expect(loadToolSetTools).toHaveBeenCalledTimes(1)

    await getExecutableTool('coding', 'shell')
    expect(loadToolSetTools).toHaveBeenCalledTimes(1)
  })
})
