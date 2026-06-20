import { describe, expect, it } from 'vitest'
import type { WorkflowBusinessEntity } from './schema'
import { workflowEntitiesToMarkdown } from './entities-markdown'

const sampleEntities: WorkflowBusinessEntity[] = [
  {
    id: 'customer',
    name: 'Customer',
    description: 'Person onboarding via the workflow.',
    fields: [
      {
        key: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        source: { kind: 'user_input', formStepId: 'collect_profile', inputKey: 'email' },
      },
      {
        key: 'account_id',
        label: 'Account ID',
        type: 'string',
        source: { kind: 'tool', tool: 'run_script', stepId: 'create_account', resultPath: 'id' },
      },
    ],
  },
]

describe('workflowEntitiesToMarkdown', () => {
  it('renders entity tables with field sources', () => {
    const md = workflowEntitiesToMarkdown(sampleEntities)
    expect(md).toContain('# Business entities')
    expect(md).toContain('## Customer')
    expect(md).toContain('User input form')
    expect(md).toContain('Tool `run_script`')
    expect(md).toContain('`email`')
  })

  it('returns empty string when no entities', () => {
    expect(workflowEntitiesToMarkdown(undefined)).toBe('')
    expect(workflowEntitiesToMarkdown([])).toBe('')
  })
})
