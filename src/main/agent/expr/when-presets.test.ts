import { describe, expect, it } from 'vitest'
import { STEP_WHEN_PRESETS, resolveStepWhenCondition } from './when-presets'
import type { AgentFlowContext } from '../context'

function ctx(partial: Partial<AgentFlowContext>): AgentFlowContext {
  return partial as AgentFlowContext
}

describe('STEP_WHEN_PRESETS', () => {
  it('hasThinking detects thinking output', () => {
    expect(
      STEP_WHEN_PRESETS.hasThinking(
        ctx({ stepOutputs: { thinking: { raw: 'x' } } }),
      ),
    ).toBe(true)
  })

  it('thinkingIsAgentCall checks execution mode', () => {
    expect(
      STEP_WHEN_PRESETS.thinkingIsAgentCall(
        ctx({
          stepOutputs: { thinking: { execution_mode: 'agent_call', raw: '' } },
        }),
      ),
    ).toBe(true)
  })

  it('hasToolLoop detects tool loop output', () => {
    expect(
      STEP_WHEN_PRESETS.hasToolLoop(
        ctx({ stepOutputs: { toolLoop: 'done' } }),
      ),
    ).toBe(true)
  })
})

describe('resolveStepWhenCondition', () => {
  it('resolves known preset name to the preset function', () => {
    const fn = resolveStepWhenCondition('hasToolLoop')
    expect(fn(ctx({ stepOutputs: { toolLoop: 'x' } }))).toBe(true)
  })
})
