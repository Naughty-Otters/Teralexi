import { describe, expect, it } from 'vitest'
import {
  ENTITIES_DEFINITION_JSON_FILENAME,
  formatEntitiesDefinitionJson,
  formatWorkflowDefinitionJson,
  WORKFLOW_DEFINITION_JSON_FILENAME,
} from './source-files'
import { WORKFLOW_RUNTIME_AGENT_ID } from '@shared/skills/workflow-panel-skills'
import { WORKFLOW_DEFINITION_VERSION } from './schema'

describe('workflow definition source files', () => {
  it('formats workflow body JSON through Zod with trailing newline', () => {
    const json = formatWorkflowDefinitionJson({
      version: WORKFLOW_DEFINITION_VERSION,
      id: 'wf-1',
      name: 'Test',
      status: 'draft',
      executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
      triggers: [{ type: 'manual' }],
      steps: [
        { id: 'step_1', type: 'task', expression: { tool: 'run_script' } },
      ],
    })
    expect(json.endsWith('\n')).toBe(true)
    expect(JSON.parse(json.trim())).toMatchObject({ id: 'wf-1' })
    expect(JSON.parse(json.trim())).not.toHaveProperty('entities')
  })

  it('uses split JSON filenames', () => {
    expect(WORKFLOW_DEFINITION_JSON_FILENAME).toBe('workflow_definition.json')
    expect(ENTITIES_DEFINITION_JSON_FILENAME).toBe('entities_definition.json')
  })

  it('formats entities JSON with trailing newline', () => {
    const json = formatEntitiesDefinitionJson([
      {
        id: 'customer',
        name: 'Customer',
        fields: [
          {
            key: 'email',
            type: 'email',
            source: { kind: 'user_input' },
          },
        ],
      },
    ])

    expect(json.endsWith('\n')).toBe(true)
    expect(JSON.parse(json.trim())).toHaveLength(1)
  })
})
