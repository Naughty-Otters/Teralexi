import { describe, expect, it } from 'vitest'
import type { SkillAgent, SkillDefinition } from './skill-models'

describe('skill-models types (smoke)', () => {
  it('accepts minimal skill definition shape', () => {
    const def: SkillDefinition = {
      id: 'demo',
      folder: '/tmp/demo',
      properties: {
        name: 'Demo',
        description: '',
        model: 'test',
        provider: 'ollama',
        color: 'primary',
        enabled: true,
      },
      sections: {
        fullMarkdown: 'Do things',
        instructions: 'Do things',
        summary: '',
        report: '',
        examples: [],
        tools: [],
      },
      systemPrompt: 'Do things',
      tools: [],
      actionToolNames: [],
    }
    const agent: SkillAgent = {
      id: 'skill:demo',
      name: def.properties.name,
      description: '',
      model: def.properties.model,
      systemPrompt: def.systemPrompt,
      color: 'primary',
      enabled: true,
      provider: 'ollama',
      isSkill: true,
      skillId: def.id,
    }
    expect(agent.isSkill).toBe(true)
  })
})
