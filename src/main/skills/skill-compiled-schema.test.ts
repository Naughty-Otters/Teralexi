import { describe, expect, it } from 'vitest'
import {
  parseSkillCompiledArtifact,
  SKILL_COMPILED_VERSION,
} from './skill-compiled-schema'

const sampleArtifact = {
  version: SKILL_COMPILED_VERSION,
  skillId: 'demo',
  sourceFingerprint: 'abc123',
  thinking: { instructions: 'Think first' },
  instructions: { instructions: 'Execute steps from skill.md' },
  validation: { rules: ['All acceptance criteria met'] },
}

describe('skill-compiled-schema', () => {
  it('round-trips through Zod', () => {
    const parsed = parseSkillCompiledArtifact(sampleArtifact)
    expect(parsed.skillId).toBe('demo')
    expect(parsed.instructions.instructions).toBe('Execute steps from skill.md')
    expect(parsed.validation.rules).toHaveLength(1)
  })
})
