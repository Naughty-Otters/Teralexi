import { describe, expect, it } from 'vitest'
import { DEFAULT_AGENT_PLAN_MODE_STATE } from './plan-mode'
import {
  planModeComposerHint,
  resolvePlanModeDisplayStatus,
  toPlanModeView,
} from './plan-mode-phase'

describe('plan-mode-phase', () => {
  it('toPlanModeView exposes persisted status and slug', () => {
    expect(
      toPlanModeView({
        ...DEFAULT_AGENT_PLAN_MODE_STATE,
        status: 'planning',
        planSlug: 'auth',
      }),
    ).toEqual({ status: 'planning', planSlug: 'auth' })
  })

  it('planModeComposerHint uses Exploring for planning status', () => {
    expect(planModeComposerHint('planning')).toContain('Exploring')
    expect(planModeComposerHint('tool_execute')).toBeNull()
  })

  it('resolvePlanModeDisplayStatus overlays wait_for_approval', () => {
    expect(
      resolvePlanModeDisplayStatus(
        { status: 'planning', planSlug: 'auth' },
        true,
      ),
    ).toBe('wait_for_approval')
    expect(
      resolvePlanModeDisplayStatus(
        { status: 'plan_tool_execute', planSlug: 'auth' },
        true,
      ),
    ).toBe('wait_for_approval')
    expect(
      resolvePlanModeDisplayStatus(
        { status: 'tool_execute', planSlug: null },
        true,
      ),
    ).toBe('tool_execute')
  })
})
