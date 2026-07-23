import { describe, expect, it } from 'vitest'
import { shouldUseSlimSubAgentContext } from './resolve-child-agent'

describe('shouldUseSlimSubAgentContext', () => {
  it('is true for explore / research agent ids', () => {
    expect(shouldUseSlimSubAgentContext({ agentId: 'skill:coding-explore' })).toBe(
      true,
    )
    expect(shouldUseSlimSubAgentContext({ agentId: 'research' })).toBe(true)
  })

  it('is true for read-only tool allowlists', () => {
    expect(
      shouldUseSlimSubAgentContext({
        allowedToolNames: ['read_file', 'lsp', 'shell'],
      }),
    ).toBe(true)
  })

  it('is false for unrestricted or mutating tools', () => {
    expect(shouldUseSlimSubAgentContext({})).toBe(false)
    expect(
      shouldUseSlimSubAgentContext({
        allowedToolNames: ['read_file', 'edit_file'],
      }),
    ).toBe(false)
  })
})
