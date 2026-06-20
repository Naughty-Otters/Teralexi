import { describe, expect, it } from 'vitest'
import {
  mergeWorkflowSourceJson,
  parseWorkflowDefinitionJson,
  safeParseWorkflowDefinitionJson,
  safeParseWorkflowEntities,
  serializeWorkflowDefinition,
  serializeWorkflowDefinitionBody,
  serializeWorkflowEntities,
} from './definition-serialization'
import { WORKFLOW_RUNTIME_AGENT_ID } from '@shared/skills/workflow-panel-skills'
import { WORKFLOW_DEFINITION_VERSION } from './schema'

const sampleDefinition = {
  version: WORKFLOW_DEFINITION_VERSION,
  id: 'wf-test',
  name: 'Test',
  status: 'draft' as const,
  executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
  triggers: [{ type: 'manual' as const }],
  steps: [
    {
      id: 'step_1',
      type: 'task' as const,
      expression: { tool: 'run_script' },
    },
  ],
  entities: [
    {
      id: 'customer',
      name: 'Customer',
      fields: [
        {
          key: 'email',
          label: 'Email',
          type: 'email' as const,
          required: true,
          source: { kind: 'user_input' as const, formStepId: 'step_1' },
        },
      ],
    },
  ],
}

describe('definition-serialization', () => {
  it('round-trips definition JSON through Zod', () => {
    const json = serializeWorkflowDefinition(sampleDefinition)
    const parsed = parseWorkflowDefinitionJson(json)
    expect(parsed.id).toBe('wf-test')
    expect(parsed.entities).toHaveLength(1)
    expect(parsed.entities?.[0]?.fields[0]?.key).toBe('email')
  })

  it('rejects invalid definition JSON with schema errors', () => {
    const result = safeParseWorkflowDefinitionJson(
      JSON.stringify({ version: 1, id: 'wf-test', name: 'Broken' }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('definition.json'))).toBe(true)
    }
  })

  it('merges split source JSON into a full definition', () => {
    const body = { ...sampleDefinition }
    const entities = body.entities!
    delete (body as { entities?: unknown }).entities
    const merged = mergeWorkflowSourceJson(
      serializeWorkflowDefinitionBody(body),
      serializeWorkflowEntities(entities),
    )
    expect(merged.success).toBe(true)
    if (merged.success) {
      expect(merged.data.entities).toHaveLength(1)
    }
  })

  it('serializes and parses entities through Zod', () => {
    const entities = sampleDefinition.entities!
    const json = serializeWorkflowEntities(entities)
    const parsed = safeParseWorkflowEntities(JSON.parse(json))
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data[0]?.id).toBe('customer')
    }
  })
})
