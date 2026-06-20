import { describe, expect, it } from 'vitest'
import { agentIsCodingAgent, skillIsCodingAgent } from './coding-agent'

describe('coding-agent', () => {
  it('detects coding skill id', () => {
    expect(skillIsCodingAgent('coding')).toBe(true)
    expect(skillIsCodingAgent('research')).toBe(false)
  })

  it('detects coding agent from catalog id', () => {
    expect(agentIsCodingAgent({ id: 'skill:coding' })).toBe(true)
    expect(agentIsCodingAgent({ skillId: 'coding', id: 'skill:coding' })).toBe(
      true,
    )
    expect(agentIsCodingAgent({ id: 'skill:research' })).toBe(false)
    expect(agentIsCodingAgent(null)).toBe(false)
  })
})
