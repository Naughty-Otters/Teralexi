import { describe, expect, it } from 'vitest'
import {
  filterChatVisibleSkills,
  filterWorkflowPanelSkills,
  isWorkflowPanelSkill,
  parseSkillVisibility,
} from './skill-visibility'
import type { SkillDefinition } from './skill-models'

function mockSkill(id: string, visibility?: 'chat' | 'workflow'): SkillDefinition {
  return {
    id,
    folder: `/skills/${id}`,
    properties: {
      name: id,
      description: '',
      model: 'gemma4',
      provider: 'ollama',
      color: 'primary',
      enabled: true,
      visibility,
    },
    sections: {
      fullMarkdown: '',
      instructions: '',
      summary: '',
      report: '',
      examples: [],
      tools: [],
    },
    systemPrompt: '',
    tools: [],
    actionToolNames: [],
  }
}

describe('skill visibility', () => {
  it('parseSkillVisibility defaults to chat', () => {
    expect(parseSkillVisibility(undefined)).toBe('chat')
    expect(parseSkillVisibility('chat')).toBe('chat')
    expect(parseSkillVisibility('workflow')).toBe('workflow')
  })

  it('filters workflow panel skills', () => {
    const skills = [
      mockSkill('default'),
      mockSkill('workflow-compiler', 'workflow'),
      mockSkill('workflow-runtime', 'workflow'),
    ]
    expect(filterChatVisibleSkills(skills).map((s) => s.id)).toEqual(['default'])
    expect(filterWorkflowPanelSkills(skills).map((s) => s.id)).toEqual([
      'workflow-compiler',
      'workflow-runtime',
    ])
    expect(isWorkflowPanelSkill(skills[1]!)).toBe(true)
  })
})
