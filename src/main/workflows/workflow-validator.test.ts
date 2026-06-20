import { describe, expect, it } from 'vitest'
import { parseWorkflowDefinition, WORKFLOW_DEFINITION_VERSION } from '@shared/workflows/schema'
import { validateWorkflowDefinition } from './workflow-validator'

describe('validateWorkflowDefinition', () => {
  it('flags duplicate step ids', () => {
    const definition = parseWorkflowDefinition({
      version: WORKFLOW_DEFINITION_VERSION,
      id: 'wf-a',
      name: 'A',
      status: 'draft',
      executor: { agentId: 'skill:default' },
      steps: [
        { id: 's1', type: 'task', expression: { tool: 'read_file' } },
        { id: 's1', type: 'task', expression: { tool: 'write_file' } },
      ],
    })
    const result = validateWorkflowDefinition(definition)
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true)
  })
})
