import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  applyCodingAgentPolicy,
  getCodingModeForConversation,
} from './coding-agent-policy'

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: vi.fn(() => ({
    getConversationSettings: vi.fn(() => null),
    getConversationPlanModeState: vi.fn(() => ({
      status: 'tool_execute',
      planSlug: null,
    })),
  })),
}))

vi.mock('./plan-mode-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./plan-mode-state')>()
  return {
    ...actual,
    isPlanModeActive: vi.fn(() => false),
  }
})

import { getConversationStore } from '@main/services/conversation-store'

describe('coding-agent-policy', () => {
  beforeEach(async () => {
    const { isPlanModeActive } = await import('./plan-mode-state')
    vi.mocked(isPlanModeActive).mockReturnValue(false)
    vi.mocked(getConversationStore).mockReturnValue({
      getConversationSettings: vi.fn(() => null),
      getConversationPlanModeState: vi.fn(() => ({
        planMode: false,
        planSlug: null,
        pendingPlanActivation: false,
        pendingPlanExecution: false,
      })),
    } as never)
  })

  it('defaults to normal mode', () => {
    expect(getCodingModeForConversation(undefined)).toBe('normal')
    expect(getCodingModeForConversation('conv-1')).toBe('normal')
  })

  it('explore mode removes mutating tools for coding skill only', () => {
    vi.mocked(getConversationStore).mockReturnValue({
      getConversationSettings: vi.fn(() => ({ codingMode: 'explore' })),
    } as never)
    const toolSet = {
      read_file: { needsApproval: false },
      write_file: { needsApproval: true },
      shell: { needsApproval: true },
    }
    applyCodingAgentPolicy(toolSet, 'conv-1', 'coding')
    expect(Object.keys(toolSet).sort()).toEqual(['read_file'])
  })

  it('yolo mode clears approvals for any skill', () => {
    vi.mocked(getConversationStore).mockReturnValue({
      getConversationSettings: vi.fn(() => ({ codingMode: 'yolo' })),
    } as never)
    const toolSet = {
      write_file: { needsApproval: true },
      shell: { needsApproval: true },
    }
    applyCodingAgentPolicy(toolSet, 'conv-1', 'documents')
    expect(toolSet.write_file.needsApproval).toBe(false)
    expect(toolSet.shell.needsApproval).toBe(false)
  })

  it('explore mode is ignored for non-coding skills', () => {
    vi.mocked(getConversationStore).mockReturnValue({
      getConversationSettings: vi.fn(() => ({ codingMode: 'explore' })),
    } as never)
    const toolSet = {
      read_file: { needsApproval: false },
      write_file: { needsApproval: true },
    }
    applyCodingAgentPolicy(toolSet, 'conv-1', 'research')
    expect(Object.keys(toolSet).sort()).toEqual(['read_file', 'write_file'])
  })

  it('plan mode filters tools for non-coding skills', async () => {
    const { isPlanModeActive } = await import('./plan-mode-state')
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    vi.mocked(getConversationStore).mockReturnValue({
      getConversationSettings: vi.fn(() => ({ codingMode: 'normal' })),
      getConversationPlanModeState: vi.fn(() => ({
        status: 'planning',
        planSlug: 'test-plan',
      })),
    } as never)
    const toolSet = {
      read_file: { needsApproval: false },
      write_file: { needsApproval: true },
      run_script: { needsApproval: true },
      custom_skill_tool: { needsApproval: true },
    }
    applyCodingAgentPolicy(toolSet, 'conv-1', 'documents')
    expect(toolSet.read_file).toBeDefined()
    expect(toolSet.write_file).toBeDefined()
    expect(toolSet.run_script).toBeUndefined()
    expect(toolSet.custom_skill_tool).toBeUndefined()
  })

  it('plan mode keeps exit_plan_mode approval in yolo', async () => {
    const { isPlanModeActive } = await import('./plan-mode-state')
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    vi.mocked(getConversationStore).mockReturnValue({
      getConversationSettings: vi.fn(() => ({ codingMode: 'yolo' })),
      getConversationPlanModeState: vi.fn(() => ({
        status: 'planning',
        planSlug: 'test-plan',
      })),
    } as never)
    const toolSet = {
      read_file: { needsApproval: false },
      write_file: { needsApproval: true },
      exit_plan_mode: { needsApproval: true },
      enter_plan_mode: { needsApproval: true },
      shell: { needsApproval: true },
    }
    applyCodingAgentPolicy(toolSet, 'conv-1', 'coding')
    expect(toolSet.exit_plan_mode.needsApproval).toBe(true)
    expect(toolSet.enter_plan_mode.needsApproval).toBe(false)
    expect(toolSet.shell).toBeUndefined()
    expect(toolSet.write_file).toBeDefined()
  })

  it('yolo mode clears approvals', () => {
    vi.mocked(getConversationStore).mockReturnValue({
      getConversationSettings: vi.fn(() => ({ codingMode: 'yolo' })),
    } as never)
    const toolSet = {
      write_file: { needsApproval: true },
      shell: { needsApproval: true },
    }
    applyCodingAgentPolicy(toolSet, 'conv-1', 'coding')
    expect(toolSet.write_file.needsApproval).toBe(false)
    expect(toolSet.shell.needsApproval).toBe(false)
  })

  it('skips explore and plan-mode tool filtering for sub-agent runs', () => {
    vi.mocked(getConversationStore).mockReturnValue({
      getConversationSettings: vi.fn(() => ({ codingMode: 'explore' })),
    } as never)
    const toolSet = {
      read_file: { needsApproval: false },
      write_file: { needsApproval: true },
      shell: { needsApproval: true },
    }
    applyCodingAgentPolicy(toolSet, 'conv-1', 'coding', 1)
    expect(toolSet.write_file).toBeDefined()
    expect(toolSet.shell).toBeDefined()
  })
})
