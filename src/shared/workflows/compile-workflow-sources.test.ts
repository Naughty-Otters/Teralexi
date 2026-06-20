import { describe, expect, it } from 'vitest'
import { WORKFLOW_RUNTIME_AGENT_ID } from '@shared/skills/workflow-panel-skills'
import { compileWorkflowSources } from './compile-workflow-sources'

describe('compileWorkflowSources', () => {
  it('merges parsed workflow and entity markdown into a definition', () => {
    const result = compileWorkflowSources({
      workflowMd: `
# Daily workflow

## Description
Summarize the daily status.

## Triggers
- type: manual

### step_one (task)
- title: First task
- tool: run_script

### step_two (channel)
- title: Notify
- channelId: slack
- action: send_notification
- template: Hello
`,
      entitiesMd: `
## customer (Customer)
| Key | Type | Source |
|---|---|---|
| email | email | user_input: step_one/email |
`,
      seed: {
        id: 'workflow-1',
        name: 'Fallback name',
        description: 'Fallback description',
      },
    })

    expect(result.workflowErrors).toEqual([])
    expect(result.entityErrors).toEqual([])
    expect(result.definition).toMatchObject({
      version: 1,
      id: 'workflow-1',
      name: 'Daily workflow',
      description: 'Summarize the daily status.',
      status: 'draft',
      executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
      triggers: [{ type: 'manual' }],
    })
    expect(result.definition.steps).toHaveLength(2)
    expect(result.definition.entities).toHaveLength(1)
  })

  it('falls back to seed values and default manual trigger when markdown is empty', () => {
    const result = compileWorkflowSources({
      workflowMd: '',
      entitiesMd: '',
      seed: {
        id: 'workflow-2',
        name: 'Seed workflow',
        description: 'Seed description',
      },
    })

    expect(result.definition.name).toBe('Seed workflow')
    expect(result.definition.description).toBe('Seed description')
    expect(result.definition.triggers).toEqual([{ type: 'manual' }])
    expect(result.definition.steps).toEqual([])
    expect(result.definition.entities).toBeUndefined()
    expect(
      result.workflowErrors.some((error) => error.includes('no steps found')),
    ).toBe(true)
    expect(result.entityErrors).toEqual([])
  })
})
