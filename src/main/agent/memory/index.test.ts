import { describe, expect, it } from 'vitest'
import * as memory from '@main/agent/memory'

describe('memory index', () => {
  it('re-exports memory modules', () => {
    expect(memory.loadMemoryRecordingSettings).toBeTypeOf('function')
    expect(memory.loadSessionMemorySnapshot).toBeTypeOf('function')
    expect(memory.recordAgentMemoryExchange).toBeTypeOf('function')
    expect(memory.enqueueAgentMemoryExchange).toBeTypeOf('function')
    expect(memory.shouldPersistAgentMemoryForRun).toBeTypeOf('function')
    expect(memory.buildMemoryPersonaInstructionBlock).toBeTypeOf('function')
  })
})
