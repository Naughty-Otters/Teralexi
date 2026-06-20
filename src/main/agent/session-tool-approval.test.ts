import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  applySessionToolApprovals,
  clearSessionApprovedToolsCache,
} from './session-tool-approval'

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getSessionApprovedTools: (id: string) =>
      id === 'c1' ? ['run_script'] : [],
    addSessionApprovedTool: vi.fn(),
  }),
}))

describe('applySessionToolApprovals', () => {
  beforeEach(() => {
    clearSessionApprovedToolsCache()
  })

  it('disables needsApproval for session-approved tool names', () => {
    const toolSet = {
      run_script: { needsApproval: true, execute: async () => ({}) },
      read_file: { needsApproval: true, execute: async () => ({}) },
    }
    applySessionToolApprovals(toolSet, 'c1')
    expect(toolSet.run_script.needsApproval).toBe(false)
    expect(toolSet.read_file.needsApproval).toBe(true)
  })

  it('no-ops without conversation id', () => {
    const toolSet = {
      run_script: { needsApproval: true, execute: async () => ({}) },
    }
    applySessionToolApprovals(toolSet, undefined)
    expect(toolSet.run_script.needsApproval).toBe(true)
  })
})
