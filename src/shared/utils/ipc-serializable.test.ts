import { describe, expect, it } from 'vitest'
import { toIpcSerializable } from './ipc-serializable'

describe('toIpcSerializable', () => {
  it('returns JSON-safe plain objects', () => {
    const input = {
      finalContent: 'done',
      compileResult: {
        workflowId: 'wf-1',
        definition: { id: 'wf-1', name: 'Test', steps: [] },
      },
    }
    const out = toIpcSerializable(input)
    expect(out).toEqual(input)
    expect(() => structuredClone(out)).not.toThrow()
  })
})
