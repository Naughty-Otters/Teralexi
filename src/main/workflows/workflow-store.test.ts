import { describe, expect, it, vi } from 'vitest'
import {
  buildBlankWorkflowDefinition,
  createWorkflow,
} from './workflow-store'

vi.mock('@main/services/conversation-store', () => {
  const workflows = new Map<string, unknown>()
  return {
    getConversationStore: () => ({
      upsertWorkflow: vi.fn((w) => {
        workflows.set(w.id, w)
        return w
      }),
      nextWorkflowVersionNumber: vi.fn(() => 1),
      insertWorkflowVersion: vi.fn(),
      getWorkflow: vi.fn((id: string) => workflows.get(id)),
    }),
  }
})

describe('createWorkflow', () => {
  it('creates workflow entity only without a DSL version', () => {
    const result = createWorkflow({
      userId: 'default',
      name: 'Test flow',
      description: 'Demo',
    })
    expect(result.workflowId).toMatch(/^wf-/)
    expect(result).not.toHaveProperty('versionId')
  })
})

describe('buildBlankWorkflowDefinition', () => {
  it('includes manual trigger and one step', () => {
    const def = buildBlankWorkflowDefinition({
      id: 'wf-1',
      name: 'Test',
    })
    expect(def.triggers).toEqual([{ type: 'manual' }])
    expect(def.steps).toHaveLength(1)
  })
})
