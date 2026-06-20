import type { SkillDefinition } from './skill-models'
import type { SkillProperties, SkillVisibility } from './types'
import {
  WORKFLOW_COMPILER_SKILL_ID,
  WORKFLOW_PANEL_SKILL_IDS,
  WORKFLOW_RUNTIME_SKILL_ID,
} from '@shared/skills/workflow-panel-skills'

export {
  WORKFLOW_COMPILER_SKILL_ID,
  WORKFLOW_RUNTIME_SKILL_ID,
  WORKFLOW_PANEL_SKILL_IDS,
} from '@shared/skills/workflow-panel-skills'

export function parseSkillVisibility(
  raw: string | undefined,
): SkillVisibility {
  if (raw?.trim().toLowerCase() === 'workflow') return 'workflow'
  return 'chat'
}

export function skillVisibility(
  properties: SkillProperties,
): SkillVisibility {
  return properties.visibility ?? 'chat'
}

export function isWorkflowPanelSkill(skill: SkillDefinition): boolean {
  return skillVisibility(skill.properties) === 'workflow'
}

export function isChatVisibleSkill(skill: SkillDefinition): boolean {
  return !isWorkflowPanelSkill(skill)
}

export function filterChatVisibleSkills(
  skills: SkillDefinition[],
): SkillDefinition[] {
  return skills.filter(isChatVisibleSkill)
}

export function filterWorkflowPanelSkills(
  skills: SkillDefinition[],
): SkillDefinition[] {
  return skills.filter(isWorkflowPanelSkill)
}
