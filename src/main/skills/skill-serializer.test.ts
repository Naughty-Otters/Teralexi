import { describe, expect, it } from 'vitest'
import { SKILL_COMPILED_VERSION } from './skill-compiled-schema'
import { skillToAgent } from './skill-serializer'
import type { SkillDefinition } from './skill-models'

function baseSkill(overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    id: 'demo',
    folder: '/skills/demo',
    properties: {
      name: 'Demo',
      description: '',
      model: 'llama',
      provider: 'ollama',
      color: 'primary',
      enabled: true,
    },
    sections: {
      fullMarkdown: 'raw instructions from disk',
      instructions: 'raw instructions from disk',
      summary: 'raw summary',
      report: '',
      examples: [],
      tools: [],
    },
    systemPrompt: 'raw system',
    tools: [],
    actionToolNames: [],
    ...overrides,
  }
}

describe('skillToAgent', () => {
  it('uses full skill.md body for skills prompt even when compilation is ready', () => {
    const agent = skillToAgent(
      baseSkill({
        compilationStatus: 'ready',
        compiledArtifact: {
          version: SKILL_COMPILED_VERSION,
          skillId: 'demo',
          sourceFingerprint: 'fp',
          thinking: { instructions: 'think' },
          instructions: { instructions: 'compiled instructions' },
          validation: { rules: ['use run_script for metrics'] },
        },
      }),
    )
    expect(agent.skillsPrompt).toBe('raw instructions from disk')
    expect(agent.executionSteps?.thinking).toBe('think')
    expect(agent.executionSteps?.skills).toBe('raw instructions from disk')
    expect(agent.executionSteps?.validation).toEqual(['use run_script for metrics'])
  })

  it('falls back to disk skill.md when compile is missing', () => {
    const agent = skillToAgent(baseSkill())
    expect(agent.skillsPrompt).toBe('raw instructions from disk')
    expect(agent.executionSteps?.skills).toBe('raw instructions from disk')
  })

  it('includes toolLoop for skills with tools', () => {
    const agent = skillToAgent(
      baseSkill({
        id: 'coding',
        tools: [
          {
            name: 'read_file',
            description: 'Read',
            execute: async () => ({}),
          },
        ],
      }),
    )
    expect(agent.executionSteps?.toolLoop?.tools).toHaveLength(1)
  })
})
