import { describe, expect, it } from 'vitest'
import { normalizeExecutionSteps } from '@shared/agent/execution-steps'

describe('normalizeExecutionSteps', () => {
  it('returns undefined when agent has no content', () => {
    expect(normalizeExecutionSteps({})).toBeUndefined()
    expect(
      normalizeExecutionSteps({
        planningPrompt: '   ',
        skillsPrompt: '',
      }),
    ).toBeUndefined()
  })

  it('merges skills and tools with max iterations', () => {
    const tool = { name: 'read_file' }
    const result = normalizeExecutionSteps({
      skillsPrompt: ' Skills ',
      availableSkillTools: [tool],
      toolLoopMaxIterations: 8,
    })

    expect(result).toEqual({
      skills: 'Skills',
      toolLoop: { tools: [tool], maxIterations: 8 },
    })
  })

  it('preserves thinking from executionSteps', () => {
    const result = normalizeExecutionSteps({
      executionSteps: { thinking: ' Thin router ' },
    })
    expect(result?.thinking).toBe('Thin router')
  })

  it('returns undefined when only toolLoopMaxIterations is set without other content', () => {
    expect(normalizeExecutionSteps({ toolLoopMaxIterations: 10 })).toBeUndefined()
  })

  it('prefers existing executionSteps toolLoop tools when no availableSkillTools', () => {
    const existingTool = { name: 'write_file' }
    const result = normalizeExecutionSteps({
      executionSteps: {
        toolLoop: { tools: [existingTool], maxIterations: 5 },
      },
    })
    expect(result?.toolLoop?.tools).toEqual([existingTool])
    expect(result?.toolLoop?.maxIterations).toBe(5)
  })
})
