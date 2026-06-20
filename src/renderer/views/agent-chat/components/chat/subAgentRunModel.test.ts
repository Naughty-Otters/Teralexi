import { describe, expect, it } from 'vitest'
import {
  buildSubAgentRunTree,
  flattenSubAgentRunsForDisplay,
  SUB_AGENT_UI_MAX_DEPTH,
} from './subAgentRunModel'

describe('subAgentRunModel', () => {
  it('builds a tree from lifecycle parts', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      parts: [
        {
          type: 'data-sub-agent-run',
          id: 'sub-agent-run-1-started',
          data: {
            kind: 'started',
            runId: 'run-1',
            parentRunId: 'root-1',
            rootRunId: 'root-1',
            agentId: 'skill:review',
            agentName: 'Reviewer',
            task: 'Review code',
          },
        },
        {
          type: 'data-sub-agent-run',
          id: 'sub-agent-run-1-finished',
          data: {
            kind: 'finished',
            runId: 'run-1',
            parentRunId: 'root-1',
            rootRunId: 'root-1',
            agentId: 'skill:review',
            agentName: 'Reviewer',
            status: 'completed',
            reportPreview: 'Looks good',
          },
        },
      ],
    } as never

    const roots = buildSubAgentRunTree(message)
    expect(roots).toHaveLength(1)
    expect(roots[0]?.status).toBe('completed')
    expect(roots[0]?.reportPreview).toBe('Looks good')
  })

  it('caps visual flatten depth at SUB_AGENT_UI_MAX_DEPTH', () => {
    const roots = [
      {
        runId: 'a',
        agentId: 'x',
        agentName: 'A',
        task: '',
        status: 'completed' as const,
        reportPreview: '',
        depth: 1,
        children: [
          {
            runId: 'b',
            agentId: 'y',
            agentName: 'B',
            task: '',
            status: 'completed' as const,
            reportPreview: '',
            depth: 2,
            children: [
              {
                runId: 'c',
                agentId: 'z',
                agentName: 'C',
                task: '',
                status: 'completed' as const,
                reportPreview: '',
                depth: 3,
                children: [],
              },
            ],
          },
        ],
      },
    ]
    const flat = flattenSubAgentRunsForDisplay(roots, SUB_AGENT_UI_MAX_DEPTH)
    expect(flat.map((n) => n.runId)).toEqual(['a', 'b'])
  })
})
