import { loadSkills } from '@main/skills/skills'
import type { SkillDefinition } from '@main/skills/skill-models'
import {
  WORKFLOW_COMPILER_SKILL_ID,
  WORKFLOW_RUNTIME_SKILL_ID,
} from '@main/skills/skill-visibility'
import { extractSection } from '@main/skills/skill-markdown'
import { SKILL_MARKDOWN_SECTIONS } from '@main/skills/llm-constants'

export type WorkflowPanelSkillInfo = {
  id: string
  name: string
  description: string
  role: 'compiler' | 'runtime'
}

const FILE_FORMAT_APPENDIX = `
Output contract:
- Use list_workflow_files, read/write/edit_workflow_definition, read/write/edit_entities_definition, and add/update/delete_entity_field only.
- Edit workflow_definition.json (workflow body) and entities_definition.json (entity array) in the workflow source folder.
- Every write/edit validates immediately; fix validationErrors until valid=true.
- Do not emit markdown, chat file dumps, or paths outside the workflow source folder.`

export async function findWorkflowSkill(
  skillId: string,
): Promise<SkillDefinition | null> {
  const skills = await loadSkills()
  return skills.find((s) => s.id === skillId) ?? null
}

/** Instructions from skill.md (compiler uses this as the LLM system prompt base). */
export function resolveSkillInstructions(skill: SkillDefinition): string {
  const compiled = skill.compiledArtifact?.instructions.instructions?.trim()
  if (compiled) return compiled
  const fromSections = skill.sections.instructions.trim()
  if (fromSections) return fromSections
  return skill.systemPrompt.trim()
}

export async function loadWorkflowCompilerSystemPrompt(): Promise<string> {
  const skill = await findWorkflowSkill(WORKFLOW_COMPILER_SKILL_ID)
  if (!skill) {
    throw new Error(
      `Workflow compiler skill "${WORKFLOW_COMPILER_SKILL_ID}" not found in skills/`,
    )
  }
  return `${resolveSkillInstructions(skill)}\n${FILE_FORMAT_APPENDIX}`
}

export async function loadWorkflowRuntimeInstructions(): Promise<string> {
  const skill = await findWorkflowSkill(WORKFLOW_RUNTIME_SKILL_ID)
  if (!skill) {
    throw new Error(
      `Workflow runtime skill "${WORKFLOW_RUNTIME_SKILL_ID}" not found in skills/`,
    )
  }
  return resolveSkillInstructions(skill)
}

export async function listWorkflowPanelSkills(): Promise<WorkflowPanelSkillInfo[]> {
  const skills = await loadSkills()
  const roleById: Record<string, WorkflowPanelSkillInfo['role']> = {
    [WORKFLOW_COMPILER_SKILL_ID]: 'compiler',
    [WORKFLOW_RUNTIME_SKILL_ID]: 'runtime',
  }

  return skills
    .filter((s) => s.id in roleById)
    .map((s) => ({
      id: s.id,
      name: s.properties.name,
      description: s.properties.description,
      role: roleById[s.id]!,
    }))
}

/** For tests: read raw Instructions section without loading full catalog. */
export function readSkillInstructionsFromMarkdown(skillMd: string): string {
  return extractSection(skillMd, SKILL_MARKDOWN_SECTIONS.INSTRUCTIONS)
}
