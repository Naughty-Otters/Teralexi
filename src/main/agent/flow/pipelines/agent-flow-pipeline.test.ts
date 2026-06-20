import { describe, expect, it } from 'vitest'
import { toolLoopStageShouldRun } from '../../expr/tool-loop-expr'
import { thinkingWantsDirectAnswer } from '../../expr/thinking-utils'

describe('ReactAgentPipeline routing', () => {
  it('direct_answer thinking skips tool loop via shouldRun gate', () => {
    const ctx = {
      opts: { skillId: 'coding' },
      runtimeTools: [{ name: 'read_file', source: 'skill' }],
      stepOutputs: {
        thinking: {
          raw: 'digest',
          execution_mode: 'direct_answer' as const,
          goal: 'Explain',
          response: 'Hello world',
        },
      },
    }
    expect(thinkingWantsDirectAnswer(ctx)).toBe(true)
    expect(toolLoopStageShouldRun(ctx as never)).toBe(false)
  })

  it('agent_call thinking allows tool loop when tools exist', () => {
    const ctx = {
      opts: { skillId: 'coding' },
      runtimeTools: [{ name: 'read_file', source: 'skill' }],
      stepOutputs: {
        thinking: {
          raw: 'digest',
          execution_mode: 'agent_call' as const,
          goal: 'Fix bug',
        },
      },
    }
    expect(thinkingWantsDirectAnswer(ctx)).toBe(false)
    expect(toolLoopStageShouldRun(ctx as never)).toBe(true)
  })
})
