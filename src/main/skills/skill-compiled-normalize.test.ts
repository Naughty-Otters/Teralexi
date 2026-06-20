import { describe, expect, it } from 'vitest'
import { SKILL_COMPILED_VERSION } from './skill-compiled-schema'
import { parseSkillCompiledArtifact } from './skill-compiled-schema'
import { normalizeSkillCompiledArtifactInput } from './skill-compiled-normalize'

describe('normalizeSkillCompiledArtifactInput', () => {
  it('migrates v1 snake_case compile JSON to v2', () => {
    const raw = normalizeSkillCompiledArtifactInput({
      version: 1,
      skill_id: 'google-workspace',
      source_fingerprint: 'fp',
      thinking: { instructions: 'think' },
      planning: {
        instructions: 'plan',
        expectations_guidance: 'expect',
        canonical_todos: [],
      },
      execution: {
        instructions: 'run tools',
        system_prompt: 'You are helpful',
      },
      summary: {
        instructions: 'sum',
        validation_rules: ['done'],
      },
    })

    const parsed = parseSkillCompiledArtifact(raw)
    expect(parsed.version).toBe(SKILL_COMPILED_VERSION)
    expect(parsed.skillId).toBe('google-workspace')
    expect(parsed.instructions.instructions).toBe('run tools')
    expect(parsed.validation.rules).toEqual(['done'])
  })

  it('accepts v2 shape directly', () => {
    const raw = normalizeSkillCompiledArtifactInput({
      version: SKILL_COMPILED_VERSION,
      skillId: 'x',
      sourceFingerprint: 'f',
      thinking: { instructions: 't' },
      instructions: { instructions: 'i' },
      validation: { rules: ['rule a'] },
    })
    const parsed = parseSkillCompiledArtifact(raw)
    expect(parsed.instructions.instructions).toBe('i')
    expect(parsed.validation.rules).toEqual(['rule a'])
  })
})
