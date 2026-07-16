import { describe, expect, it } from 'vitest'
import {
  planModeComposerHint,
  resolvePlanModeDisplayStatus,
} from './plan-mode-status'

describe('resolvePlanModeDisplayStatus', () => {
  it('shows wait_for_approval only while HITL is pending during plan phases', () => {
    expect(
      resolvePlanModeDisplayStatus(
        { status: 'plan_tool_execute', planSlug: 'p' },
        true,
      ),
    ).toBe('wait_for_approval')
    expect(
      resolvePlanModeDisplayStatus(
        { status: 'plan_tool_execute', planSlug: 'p' },
        false,
      ),
    ).toBe('plan_tool_execute')
  })

  it('does not overlay wait_for_approval in normal tool_execute', () => {
    expect(
      resolvePlanModeDisplayStatus(
        { status: 'tool_execute', planSlug: null },
        true,
      ),
    ).toBe('tool_execute')
  })
})

describe('planModeComposerHint', () => {
  it('shows waiting copy only for wait_for_approval', () => {
    expect(planModeComposerHint('wait_for_approval')).toContain(
      'Waiting for your approval',
    )
    expect(planModeComposerHint('plan_tool_execute')).toContain('Executing')
    expect(planModeComposerHint('tool_execute')).toBeNull()
  })
})
