import { describe, expect, it } from 'vitest'
import {
  agentRequiresWorkspace,
  resolveAgentSkillId,
  skillRequiresWorkspace,
} from './workspace-required-skills'

describe('workspace-required-skills', () => {
  it('resolves skill id from skillId or skill: prefix', () => {
    expect(resolveAgentSkillId({ skillId: 'coding', id: 'skill:coding' })).toBe(
      'coding',
    )
    expect(resolveAgentSkillId({ id: 'skill:code-review' })).toBe('code-review')
    expect(resolveAgentSkillId({ id: 'custom-agent' })).toBeNull()
  })

  it('flags coding and code-review only', () => {
    expect(skillRequiresWorkspace('coding')).toBe(true)
    expect(skillRequiresWorkspace('code-review')).toBe(true)
    expect(skillRequiresWorkspace('default')).toBe(false)
    expect(agentRequiresWorkspace({ skillId: 'documents' })).toBe(false)
  })
})
