import { describe, expect, it } from 'vitest'
import { applyCodingDirectToolLoopPolicy } from './coding-agent-pipeline'

describe('applyCodingDirectToolLoopPolicy', () => {
  it('is a no-op under global ReAct pipeline', () => {
    const agent = {
      skillId: 'coding',
      executionSteps: {
        skills: 'Execute',
        toolLoop: { tools: [{ name: 'read_file' }] },
      },
    }
    applyCodingDirectToolLoopPolicy(agent)
    expect(agent.executionSteps?.toolLoop?.tools).toHaveLength(1)
  })
})
