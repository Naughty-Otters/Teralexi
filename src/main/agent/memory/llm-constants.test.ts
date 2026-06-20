import { describe, expect, it } from 'vitest'
import { MEMORY_ABSTRACTOR_LLM } from './llm-constants'

describe('MEMORY_ABSTRACTOR_LLM', () => {
  it('defines session and persona prompts', () => {
    expect(MEMORY_ABSTRACTOR_LLM.SESSION_SYSTEM).toContain('session memory')
    expect(MEMORY_ABSTRACTOR_LLM.AGENT_PERSONA_SYSTEM).toContain('ONE agent')
    expect(MEMORY_ABSTRACTOR_LLM.USER_PERSONA_SYSTEM).toContain('SHORT global')
    expect(MEMORY_ABSTRACTOR_LLM.SESSION_USER_ALL_EXCHANGES).toContain(
      'chronological',
    )
  })
})
