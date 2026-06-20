import { jsonSchema } from '@openfde-ai'
import type { Tool } from 'ai'
import { z } from 'zod'
import { loadSkillActions } from '@main/skills/skill-module-loader'
import { resolveSkillFolder } from '@main/skills/skill-path'
import { WORKFLOW_COMPILER_SKILL_ID } from '@main/skills/skill-visibility'
import type { SkillTool } from '@main/skills/types'
import { WORKFLOW_COMPILER_TOOL_NAMES } from './workflow-source-scope'

export function skillToolsToAgentTools(
  tools: SkillTool[],
): Record<string, Tool> {
  const toolSet: Record<string, Tool> = {}
  for (const tool of tools) {
    toolSet[tool.name] = {
      type: 'function',
      description: tool.description,
      inputSchema:
        tool.inputSchema != null
          ? jsonSchema(tool.inputSchema)
          : jsonSchema(z.object({})),
      needsApproval: tool.needsApproval ?? false,
      execute: async (input: unknown) =>
        tool.execute(
          typeof input === 'object' && input !== null
            ? (input as Record<string, unknown>)
            : {},
        ),
    }
  }
  return toolSet
}

export async function loadWorkflowCompilerAgentTools(): Promise<
  Record<string, Tool>
> {
  const skillFolder = resolveSkillFolder(WORKFLOW_COMPILER_SKILL_ID)
  if (!skillFolder) {
    throw new Error(
      `Workflow compiler skill folder not found: ${WORKFLOW_COMPILER_SKILL_ID}`,
    )
  }
  const tools = await loadSkillActions(skillFolder, [
    ...WORKFLOW_COMPILER_TOOL_NAMES,
  ])
  return skillToolsToAgentTools(tools)
}
