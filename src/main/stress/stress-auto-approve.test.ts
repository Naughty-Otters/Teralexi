import { describe, expect, it } from 'vitest'
import { applyStressAutoApproveToolCalls, isStressAutoApproveToolCalls, setStressAutoApproveToolCalls } from './stress-auto-approve'

describe('stress-auto-approve', () => {
  it('clears needsApproval when enabled', () => {
    setStressAutoApproveToolCalls(false)
    expect(isStressAutoApproveToolCalls()).toBe(false)
    const tools = {
      write_file: { needsApproval: true },
      read_file: { needsApproval: false },
    }
    applyStressAutoApproveToolCalls(tools)
    expect(tools.write_file.needsApproval).toBe(true)

    setStressAutoApproveToolCalls(true, 'run-1')
    applyStressAutoApproveToolCalls(tools)
    expect(tools.write_file.needsApproval).toBe(false)
    expect(tools.read_file.needsApproval).toBe(false)

    setStressAutoApproveToolCalls(false)
  })
})
