import { describe, expect, it } from 'vitest'
import {
  groupBestOfNCandidates,
  type SubAgentRunNode,
} from './subAgentRunModel'

function node(partial: Partial<SubAgentRunNode> & Pick<SubAgentRunNode, 'runId' | 'task'>): SubAgentRunNode {
  return {
    agentId: 'skill:coding',
    agentName: 'Coding',
    status: 'completed',
    reportPreview: '',
    depth: 1,
    children: [],
    ...partial,
  }
}

describe('groupBestOfNCandidates', () => {
  it('groups sibling runs that share a task and worktree', () => {
    const groups = groupBestOfNCandidates([
      node({ runId: 'a', task: 'Fix login', worktreeBranch: 'teralexi/sub-agent/a' }),
      node({ runId: 'b', task: 'Fix login', worktreeBranch: 'teralexi/sub-agent/b' }),
      node({ runId: 'c', task: 'Other', worktreeBranch: 'teralexi/sub-agent/c' }),
      node({ runId: 'd', task: 'Fix login' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.map((n) => n.runId)).toEqual(['a', 'b'])
  })
})
