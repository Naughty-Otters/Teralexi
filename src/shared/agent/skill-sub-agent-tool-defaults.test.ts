import { describe, expect, it } from 'vitest'
import {
  expandSkillSubAgentAvailableSet,
  mergeSkillSubAgentApprovalOverrides,
} from './skill-sub-agent-tool-defaults'

const catalog = [
  { name: 'read_file', tags: ['file-system'] },
  { name: 'invoke_agents', tags: ['sub-agents'], needsApproval: true },
]

describe('skill-sub-agent-tool-defaults', () => {
  it('expandSkillSubAgentAvailableSet adds core sub-agent tools', () => {
    expect(
      expandSkillSubAgentAvailableSet(catalog, ['read_file']).sort(),
    ).toEqual(['invoke_agents', 'read_file'])
  })

  it('mergeSkillSubAgentApprovalOverrides disables approval by default', () => {
    expect(
      mergeSkillSubAgentApprovalOverrides(
        catalog,
        ['invoke_agents'],
        undefined,
      ),
    ).toEqual({
      invoke_agents: false,
    })
  })
})
