import { describe, expect, it } from 'vitest'
import { WORKFLOW_RUNTIME_SKILL_ID } from '@main/skills/skill-visibility'
import { resolveExecutorSkillFolderId } from './workflow-agent-run'
import type { WorkflowDefinition } from '@shared/workflows/schema'

function minimalDefinition(
  executorAgentId?: string,
): WorkflowDefinition {
  return {
    version: 1,
    id: 'wf-test',
    name: 'Test',
    status: 'confirmed',
    executor: { agentId: executorAgentId ?? `skill:${WORKFLOW_RUNTIME_SKILL_ID}` },
    inputs: [],
    triggers: [{ type: 'manual' }],
    steps: [],
  }
}

describe('resolveExecutorSkillFolderId', () => {
  it('maps skill:default to workflow-runtime', () => {
    expect(
      resolveExecutorSkillFolderId(minimalDefinition('skill:default')),
    ).toBe(WORKFLOW_RUNTIME_SKILL_ID)
  })

  it('uses explicit skill folder id', () => {
    expect(
      resolveExecutorSkillFolderId(minimalDefinition('skill:custom-skill')),
    ).toBe('custom-skill')
  })

  it('falls back to workflow-runtime when executor is missing', () => {
    const def = minimalDefinition()
    def.executor = { agentId: '' }
    expect(resolveExecutorSkillFolderId(def)).toBe(WORKFLOW_RUNTIME_SKILL_ID)
  })
})
