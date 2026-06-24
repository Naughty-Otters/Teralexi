import { describe, expect, it } from 'vitest'
import { loadToolSetTools } from './skill-module-loader'
import { skillToAgent } from './skill-serializer'
import { isWorkflowPanelAgentId } from '@shared/skills/workflow-panel-skills'

describe('LoadSkills IPC payload', () => {
  it('serializes every bundled skill agent for IPC', async () => {
    const globalTools = await loadToolSetTools()
    const { buildBundledSkillDefinitions } = await import('./bundled-skills')
    const skills = await buildBundledSkillDefinitions(globalTools)
    expect(skills.length).toBeGreaterThan(2)

    const agents = skills.map((skill) => skillToAgent(skill))
    const chatAgents = agents.filter(
      (agent) => agent.enabled && !isWorkflowPanelAgentId(agent.id),
    )
    expect(chatAgents.length).toBeGreaterThan(0)
    expect(() => structuredClone(agents)).not.toThrow()
  })
})
