import { describe, expect, it } from 'vitest'
import { maybeScheduleResearchHandoff } from './handoff'
import { resolveResearchConfig } from './config'
import { RESEARCH_LLM } from './research-llm'

describe('maybeScheduleResearchHandoff', () => {
  it('is a no-op hook for future pipeline wiring', () => {
    expect(RESEARCH_LLM.FOLLOW_UP_SYSTEM).toContain('sufficient')
    expect(() =>
      maybeScheduleResearchHandoff({} as never, resolveResearchConfig({ topic: 'x' }), '# digest'),
    ).not.toThrow()
  })
})
