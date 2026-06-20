import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_PLAN_MODE_STATE,
  parseAgentPlanModeState,
  serializeAgentPlanModeState,
} from './plan-mode'

describe('plan-mode state', () => {
  it('parses defaults for empty input', () => {
    expect(parseAgentPlanModeState(null)).toEqual(DEFAULT_AGENT_PLAN_MODE_STATE)
  })

  it('parses legacy active field as planning', () => {
    expect(parseAgentPlanModeState({ active: true }).status).toBe('planning')
  })

  it('migrates legacy boolean flags to status', () => {
    expect(
      parseAgentPlanModeState({
        planMode: false,
        planExecutionActive: true,
      }).status,
    ).toBe('plan_tool_execute')
  })

  it('round-trips new serialization format', () => {
    const state = {
      status: 'planning' as const,
      planSlug: 'auth-refactor',
    }
    expect(parseAgentPlanModeState(JSON.parse(serializeAgentPlanModeState(state)))).toEqual(
      state,
    )
  })
})
