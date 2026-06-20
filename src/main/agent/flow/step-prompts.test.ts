import { describe, expect, it } from 'vitest'
import { ConfigContext } from '../config/context'
import {
  resolveFlowStepExecutorInstructions,
  resolveFlowStepInstructions,
  resolveFlowStepSystem,
} from './step-prompts'

describe('flow-step-prompts', () => {
  const configCtx = new ConfigContext(() => undefined)

  it('resolveFlowStepSystem uses override when set', () => {
    expect(
      resolveFlowStepSystem(
        { systemMessage: 'Custom system' },
        configCtx,
        'Default',
      ),
    ).toContain('Custom system')
  })

  it('resolveFlowStepSystem falls back to default', () => {
    expect(resolveFlowStepSystem({}, configCtx, 'Default')).toContain('Default')
  })

  it('resolveFlowStepInstructions uses override when set', () => {
    expect(
      resolveFlowStepInstructions({ instructions: 'Do X' }, 'Default user'),
    ).toBe('Do X')
  })

  it('resolveFlowStepExecutorInstructions uses system_msg only for tool loop', () => {
    expect(
      resolveFlowStepExecutorInstructions(
        {
          systemMessage: 'Sys',
          instructions: 'Inst',
          userPrompt: 'user',
        },
        'built',
      ),
    ).toBe('Sys')
  })

  it('resolveFlowStepExecutorInstructions falls back to built', () => {
    expect(resolveFlowStepExecutorInstructions({}, 'built')).toBe('built')
  })
})
