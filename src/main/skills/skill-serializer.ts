import { DEFAULT_TOOL_LOOP_MAX_ITERATIONS } from '@shared/agent/tool-loop'
import type { SkillCompiledArtifact } from './skill-compiled-schema'
import type { SkillDefinition, SkillAgent } from './skill-models'
import { getHostToolOs } from './skill-path'
import { serializeToolInputSchema } from './skill-zod-schema'
import { serializeNeedsApproval } from './tool-ipc-meta'

export { serializeNeedsApproval } from './tool-ipc-meta'

function useCompiled(skill: SkillDefinition): SkillCompiledArtifact | undefined {
  if (skill.compilationStatus === 'ready' && skill.compiledArtifact) {
    return skill.compiledArtifact
  }
  return undefined
}

export function skillToAgent(skill: SkillDefinition): SkillAgent {
  const compiled = useCompiled(skill)
  const hasTools = skill.tools.length > 0
  const hostToolOs = getHostToolOs()

  const skillsText =
    skill.sections.fullMarkdown.trim() || skill.sections.instructions.trim()
  const thinkingText = compiled?.thinking.instructions.trim()
  const validationRules = compiled?.validation.rules ?? []

  const needsExecutionSteps =
    hasTools ||
    Boolean(thinkingText) ||
    skillsText.trim().length > 0 ||
    validationRules.length > 0

  return {
    id: `skill:${skill.id}`,
    name: skill.properties.name,
    description: skill.properties.description,
    model: skill.properties.model,
    systemPrompt: skill.systemPrompt,
    color: skill.properties.color,
    enabled: skill.properties.enabled,
    provider: skill.properties.provider,
    isSkill: true,
    skillId: skill.id,
    compiledArtifact: compiled,
    compilationStatus: skill.compilationStatus ?? (compiled ? 'ready' : 'missing'),
    ...(skill.properties.allowedTools?.length
      ? { allowedTools: [...skill.properties.allowedTools] }
      : {}),
    ...(skill.actionToolNames.length > 0
      ? { actionToolNames: [...skill.actionToolNames] }
      : {}),
    ...(skill.properties.skillGroup
      ? {
          skillGroup: skill.properties.skillGroup,
          skillGroupLabel: skill.properties.skillGroupLabel,
          skillVariant: skill.properties.skillVariant,
          skillVariantLabel: skill.properties.skillVariantLabel,
          skillGroupOrder: skill.properties.skillGroupOrder,
          skillVariantOrder: skill.properties.skillVariantOrder,
          skillGroupPrimary: skill.properties.skillGroupPrimary,
        }
      : {}),
    skillsPrompt: skillsText,
    executionSteps: needsExecutionSteps
      ? {
          ...(thinkingText ? { thinking: thinkingText } : {}),
          toolLoop: hasTools
            ? {
                tools: skill.tools.map((tool) => ({
                  name: tool.name,
                  tags: tool.tags,
                  description: tool.description,
                  inputSchema: serializeToolInputSchema(tool.inputSchema),
                  os: tool.os ?? hostToolOs,
                  needsApproval: serializeNeedsApproval(tool.needsApproval),
                })),
                maxIterations:
                  skill.properties.maxIterations ??
                  DEFAULT_TOOL_LOOP_MAX_ITERATIONS,
              }
            : undefined,
          skills: skillsText,
          ...(validationRules.length > 0
            ? { validation: validationRules }
            : {}),
        }
      : undefined,
  }
}
