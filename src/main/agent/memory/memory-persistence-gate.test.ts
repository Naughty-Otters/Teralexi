import { describe, expect, it } from 'vitest'
import { StepOutputStore } from '../steps/step-output-store'
import { TOOL_LOOP_STEP_ID } from '../constants/step-ids'
import { shouldPersistAgentMemoryForRun } from './memory-persistence-gate'

describe('shouldPersistAgentMemoryForRun', () => {
  it('returns true when tool loop output exists and run is not paused', () => {
    expect(
      shouldPersistAgentMemoryForRun(
        { abortSignal: undefined } as never,
        {
          outputStore: { latest: () => undefined },
          stepOutputs: { toolLoop: 'Applied the requested patch successfully.' },
          hitlAwaitingApproval: false,
          hitlAwaitingFormData: false,
          hitlAwaitingManualIntervention: false,
        },
      ),
    ).toBe(true)
  })

  it('returns false when run is paused for HITL approval', () => {
    expect(
      shouldPersistAgentMemoryForRun(
        { abortSignal: undefined } as never,
        {
          outputStore: { latest: () => undefined },
          stepOutputs: { toolLoop: 'Generated output before pause.' },
          hitlAwaitingApproval: true,
          hitlAwaitingFormData: false,
          hitlAwaitingManualIntervention: false,
        },
      ),
    ).toBe(false)
  })

  it('returns false when no meaningful outputs were produced', () => {
    expect(
      shouldPersistAgentMemoryForRun(
        { abortSignal: undefined } as never,
        {
          outputStore: new StepOutputStore(),
          stepOutputs: {},
          hitlAwaitingApproval: false,
          hitlAwaitingFormData: false,
          hitlAwaitingManualIntervention: false,
        },
      ),
    ).toBe(false)
  })

  it('returns true when outputStore has tool-loop entries but digest is empty', () => {
    const outputStore = new StepOutputStore()
    outputStore.push({
      stepId: TOOL_LOOP_STEP_ID,
      instanceKey: 'toolLoop:1',
      data: { text: 'Ran uptime command.' },
      timestamp: new Date().toISOString(),
    })

    expect(
      shouldPersistAgentMemoryForRun(
        { abortSignal: undefined } as never,
        {
          outputStore,
          stepOutputs: {},
          hitlAwaitingApproval: false,
          hitlAwaitingFormData: false,
          hitlAwaitingManualIntervention: false,
        },
      ),
    ).toBe(true)
  })
})
