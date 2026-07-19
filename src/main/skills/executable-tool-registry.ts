import type { SkillTool } from './types'
import {
  loadSkillActionsForSkillId,
  loadToolSetTools,
} from './skill-module-loader'
import {
  clearExecutableToolRegistry,
  executableToolRegistryByKey,
} from './executable-tool-registry-state'

export { clearExecutableToolRegistry }

function skillToolKey(skillId: string, toolName: string): string {
  return `skill:${skillId.trim()}:${toolName.trim()}`
}

function toolSetKey(toolName: string): string {
  return `toolSet:${toolName.trim()}`
}

/**
 * Resolve a skill or toolSet tool for execute, caching the loaded instance so
 * repeated tool calls do not re-esbuild / re-eval skill modules.
 */
export async function getExecutableTool(
  skillId: string,
  toolName: string,
): Promise<SkillTool> {
  const skillKey = skillToolKey(skillId, toolName)
  const skillHit = executableToolRegistryByKey.get(skillKey)
  if (skillHit) return skillHit.tool as SkillTool

  const skillTools = await loadSkillActionsForSkillId(skillId, [toolName])
  const fromSkill = skillTools.find((t) => t.name === toolName)
  if (fromSkill) {
    executableToolRegistryByKey.set(skillKey, {
      tool: fromSkill,
      source: 'skill',
    })
    return fromSkill
  }

  const tsKey = toolSetKey(toolName)
  const toolSetHit = executableToolRegistryByKey.get(tsKey)
  if (toolSetHit) return toolSetHit.tool as SkillTool

  const toolSetTools = await loadToolSetTools()
  const fromToolSet = toolSetTools.find((t) => t.name === toolName)
  if (fromToolSet) {
    executableToolRegistryByKey.set(tsKey, {
      tool: fromToolSet,
      source: 'toolSet',
    })
    return fromToolSet
  }

  throw new Error(`Tool not found: ${toolName}`)
}
