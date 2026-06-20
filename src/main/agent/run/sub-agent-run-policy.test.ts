import { describe, expect, it } from 'vitest'
import { isSubAgentAgentRun } from './sub-agent-run-policy'

describe('sub-agent-run-policy', () => {
  it('detects nested runs by depth', () => {
    expect(isSubAgentAgentRun({ agentRun: { meta: { depth: 0 } } })).toBe(false)
    expect(isSubAgentAgentRun({ agentRun: { meta: { depth: 1 } } })).toBe(true)
    expect(isSubAgentAgentRun(undefined)).toBe(false)
  })
})
