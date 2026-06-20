import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClientUiMessage } from '../utils/client-ui-parse'
import {
  clientUiIndicatesExitPlanModeApprovalResume,
  finalizeExitPlanModeApprovalResume,
  findApprovedExitPlanModeCall,
} from './plan-mode-exit-approval-resume'

vi.mock('./plan-mode-state', () => ({
  isPlanModeActive: vi.fn(() => true),
  isPlanExecutionActive: vi.fn(() => false),
}))

import { isPlanExecutionActive, isPlanModeActive } from './plan-mode-state'

function assistantWithExitApproval(
  approved = true,
): ClientUiMessage[] {
  return [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'plan this' }],
    },
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'exit_plan_mode',
          toolCallId: 'tc-exit',
          state: 'approval-responded',
          input: { summary: 'Ship the plan' },
          approval: { id: 'ap-exit', approved },
        },
      ],
    },
  ]
}

describe('plan-mode exit approval resume', () => {
  beforeEach(() => {
    vi.mocked(isPlanModeActive).mockReturnValue(true)
    vi.mocked(isPlanExecutionActive).mockReturnValue(false)
  })

  it('finds approved exit_plan_mode call in client UI', () => {
    const call = findApprovedExitPlanModeCall(assistantWithExitApproval())
    expect(call).toEqual({
      toolCallId: 'tc-exit',
      approvalId: 'ap-exit',
      input: { summary: 'Ship the plan' },
    })
    expect(clientUiIndicatesExitPlanModeApprovalResume(assistantWithExitApproval())).toBe(
      true,
    )
  })

  it('ignores denied exit_plan_mode approval', () => {
    expect(findApprovedExitPlanModeCall(assistantWithExitApproval(false))).toBeNull()
  })

  it('executes exit_plan_mode and emits tool output chunk', async () => {
    const execute = vi.fn(async () => ({
      ok: true,
      status: 'plan_tool_execute',
    }))
    const onUIMessageChunk = vi.fn()

    const result = await finalizeExitPlanModeApprovalResume({
      conversationId: 'conv-1',
      clientUi: assistantWithExitApproval(),
      toolSet: { exit_plan_mode: { execute } },
      onUIMessageChunk,
    })

    expect(result.handled).toBe(true)
    expect(execute).toHaveBeenCalledWith({ summary: 'Ship the plan' })
    expect(onUIMessageChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-output-available',
        toolCallId: 'tc-exit',
        toolName: 'exit_plan_mode',
      }),
    )
  })

  it('skips execute when execution phase is already active', async () => {
    vi.mocked(isPlanExecutionActive).mockReturnValue(true)
    vi.mocked(isPlanModeActive).mockReturnValue(false)

    const execute = vi.fn()
    const result = await finalizeExitPlanModeApprovalResume({
      conversationId: 'conv-1',
      clientUi: assistantWithExitApproval(),
      toolSet: { exit_plan_mode: { execute } },
    })

    expect(result.handled).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })
})
