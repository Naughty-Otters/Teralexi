import { describe, expect, it, beforeEach } from 'vitest'
import {
  canAutoActivatePlanMode,
  heuristicTaskLooksComplex,
  heuristicTaskLooksReviewOrFocused,
  maybeAutoActivatePlanMode,
} from './auto-plan-mode'
import {
  markPlanExecutionCompleted,
  resetAllPlanRemindersForTests,
} from './plan-mode-session-reminders'

describe('auto-plan-mode', () => {
  beforeEach(() => {
    resetAllPlanRemindersForTests()
  })

  it('heuristicTaskLooksComplex detects multi-step language', () => {
    expect(
      heuristicTaskLooksComplex(
        'Refactor the auth module across multiple files and migrate to JWT',
      ),
    ).toBe(true)
    expect(heuristicTaskLooksComplex('What is a closure?')).toBe(false)
  })

  it('heuristicTaskLooksReviewOrFocused detects review requests', () => {
    expect(
      heuristicTaskLooksReviewOrFocused('do code revewi for my worskapces'),
    ).toBe(true)
    expect(
      heuristicTaskLooksReviewOrFocused('review my PR before merge'),
    ).toBe(true)
    expect(
      heuristicTaskLooksReviewOrFocused('implement login with OAuth'),
    ).toBe(false)
  })

  it('canAutoActivatePlanMode is true for normal coding conversations', () => {
    expect(canAutoActivatePlanMode('conv-1', 'coding')).toBe(true)
    expect(canAutoActivatePlanMode('conv-1', 'documents')).toBe(false)
  })

  it('canAutoActivatePlanMode is false shortly after plan execution completes', () => {
    markPlanExecutionCompleted('conv-1')
    expect(canAutoActivatePlanMode('conv-1', 'coding')).toBe(false)
  })

  it('maybeAutoActivatePlanMode is skipped for sub-agent runs', async () => {
    const result = await maybeAutoActivatePlanMode({
      opts: { conversationId: 'conv-1', skillId: 'coding' },
      agentRun: { meta: { depth: 1 } },
      getLatestUserMessageContent: () =>
        'Refactor auth across multiple files and migrate to JWT',
    } as never)

    expect(result).toBe(false)
  })
})
