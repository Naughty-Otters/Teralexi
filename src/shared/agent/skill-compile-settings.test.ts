import { describe, expect, it } from 'vitest'
import {
  parseSkillCompileLlmChoice,
  parseSkillCompilePerSkillOverrides,
  parseSkillCompileSettings,
  resolveSkillCompileLlm,
  serializeSkillCompilePerSkillOverrides,
  SKILL_COMPILE_PROP_KEYS,
} from './skill-compile-settings'

describe('skill-compile-settings', () => {
  const skillProps = { provider: 'ollama' as const, model: 'gemma4' }

  it('uses skill properties by default', () => {
    const settings = parseSkillCompileSettings({})
    const resolved = resolveSkillCompileLlm('demo', skillProps, settings)
    expect(resolved).toEqual({ ...skillProps, source: 'skill_properties' })
  })

  it('per-skill override wins over properties', () => {
    const settings = parseSkillCompileSettings({
      [SKILL_COMPILE_PROP_KEYS.perSkillOverrides]: JSON.stringify({
        demo: { provider: 'openai', model: 'gpt-4o-mini' },
      }),
    })
    const resolved = resolveSkillCompileLlm('demo', skillProps, settings)
    expect(resolved.source).toBe('per_skill')
    expect(resolved.provider).toBe('openai')
  })

  it('round-trips per-skill overrides JSON', () => {
    const json = serializeSkillCompilePerSkillOverrides({
      a: { provider: 'ollama', model: 'llama3.2' },
    })
    const settings = parseSkillCompileSettings({
      [SKILL_COMPILE_PROP_KEYS.perSkillOverrides]: json,
    })
    expect(settings.perSkill.a?.model).toBe('llama3.2')
  })

  it('rejects invalid compile choices and override payloads', () => {
    expect(parseSkillCompileLlmChoice('bad', 'm')).toBeNull()
    expect(parseSkillCompileLlmChoice('ollama', '   ')).toBeNull()
    expect(parseSkillCompilePerSkillOverrides('not-json')).toEqual({})
    expect(parseSkillCompilePerSkillOverrides('[]')).toEqual({})
    expect(parseSkillCompilePerSkillOverrides('   ')).toEqual({})
    expect(
      parseSkillCompilePerSkillOverrides(
        JSON.stringify({
          ok: { provider: 'openai', model: 'gpt-4o' },
          skip: 'invalid',
          blank: { provider: 'ollama', model: '' },
        }),
      ),
    ).toEqual({ ok: { provider: 'openai', model: 'gpt-4o' } })
  })

  it('omits blank models when serializing overrides', () => {
    expect(
      serializeSkillCompilePerSkillOverrides({
        keep: { provider: 'ollama', model: ' llama ' },
        drop: { provider: 'openai', model: '   ' },
      }),
    ).toBe(JSON.stringify({ keep: { provider: 'ollama', model: 'llama' } }))
  })
})
