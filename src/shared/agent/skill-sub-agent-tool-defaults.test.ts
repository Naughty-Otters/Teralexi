import { describe, expect, it } from 'vitest'
import {
  expandSkillSubAgentAvailableSet,
  mergeSkillSubAgentApprovalOverrides,
} from './skill-sub-agent-tool-defaults'

const catalog = [
  { name: 'read_file', tags: ['file-system'] },
  { name: 'invoke_agent', tags: ['sub-agents'], needsApproval: true },
  { name: 'invoke_agents', tags: ['sub-agents'] },
  { name: 'wait_for_sub_agent_runs', tags: ['sub-agents'] },
]

describe('skill-sub-agent-tool-defaults', () => {
  it('expandSkillSubAgentAvailableSet adds sub-agent tools', () => {
    expect(
      expandSkillSubAgentAvailableSet(catalog, ['read_file']).sort(),
    ).toEqual([
      'invoke_agent',
      'invoke_agents',
      'read_file',
      'wait_for_sub_agent_runs',
    ])
  })

  it('mergeSkillSubAgentApprovalOverrides disables approval by default', () => {
    expect(
      mergeSkillSubAgentApprovalOverrides(
        catalog,
        ['invoke_agent', 'invoke_agents', 'wait_for_sub_agent_runs'],
        undefined,
      ),
    ).toEqual({
      invoke_agent: false,
      invoke_agents: false,
      wait_for_sub_agent_runs: false,
    })
  })
})
