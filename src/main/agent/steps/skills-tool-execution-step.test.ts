import { describe, expect, it } from 'vitest'
import { toolLoopStageShouldRun } from './skills-tool-execution-step'

describe('skills-tool-execution-step re-exports', () => {
  it('toolLoopStageShouldRun returns true when skill tools available', () => {
    expect(
      toolLoopStageShouldRun({
        opts: { skillId: 'skill-1' },
        runtimeTools: [{ name: 'read_file', source: 'skill' }],
      } as never),
    ).toBe(true)
  })

  it('toolLoopStageShouldRun is false without tools', () => {
    expect(
      toolLoopStageShouldRun({
        opts: {},
        runtimeTools: [],
      } as never),
    ).toBe(false)
  })
})
