import { describe, expect, it } from 'vitest'
import {
  isWorkflowPanelAgentId,
  isWorkflowPanelSkillId,
  WORKFLOW_PANEL_SKILL_IDS,
  WORKFLOW_RUNTIME_AGENT_ID,
} from './workflow-panel-skills'

describe('workflow-panel-skills', () => {
  it('identifies workflow panel skill and agent ids', () => {
    expect(WORKFLOW_PANEL_SKILL_IDS).toContain('workflow-compiler')
    expect(isWorkflowPanelSkillId('workflow-runtime')).toBe(true)
    expect(isWorkflowPanelSkillId('default')).toBe(false)
    expect(isWorkflowPanelAgentId('skill:workflow-compiler')).toBe(true)
    expect(isWorkflowPanelAgentId('skill:default')).toBe(false)
    expect(WORKFLOW_RUNTIME_AGENT_ID).toBe('skill:workflow-runtime')
  })
})
