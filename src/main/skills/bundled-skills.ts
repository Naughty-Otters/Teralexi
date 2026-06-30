import type { SkillDefinition } from './skill-models'
import type { SkillTool } from './types'
import {
  extractYamlFrontmatterBlock,
  normalizeSkillFileText,
  resolvePropertiesRawFromContent,
  stripYamlFrontmatter,
} from './skill-path'
import { parseSkillMarkdown } from './skill-markdown'
import {
  resolveSkillToolCatalog,
  tagToolsForSkill,
} from './resolve-skill-tools'
import { expandSkillAllowedToolsForCatalog } from '@shared/agent/skill-workspace-tool-defaults'
import { getBundledSkillActionTools } from './bundled-skill-actions'
import {
  BUNDLED_SKILL_IDS,
  BUNDLED_SKILL_SOURCES,
  bundledSkillFolder,
  verifyBundledSkillsManifest,
} from './bundled-skills-manifest'

export {
  BUNDLED_SKILL_IDS,
  BUNDLED_SKILL_SOURCES,
  bundledSkillFolder,
  getBundledSkillIds,
  getBundledSkillSource,
  isBundledSkillId,
  listBundledSkillAttachments,
  materializeBundledSkillToDirectory,
  readBundledSkillAttachment,
  verifyBundledSkillsManifest,
} from './bundled-skills-manifest'
export { getBundledSkillActionTools } from './bundled-skill-actions'

export async function buildBundledSkillDefinitions(
  globalTools: SkillTool[],
): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = []

  for (const skillId of BUNDLED_SKILL_IDS) {
    const source = BUNDLED_SKILL_SOURCES[skillId]
    if (!source) continue

    let skillRaw = normalizeSkillFileText(source.skillMd)
    const propertiesRaw = resolvePropertiesRawFromContent(
      skillId,
      skillRaw,
      normalizeSkillFileText(source.propertiesMd),
    )
    if (extractYamlFrontmatterBlock(skillRaw)) {
      skillRaw = stripYamlFrontmatter(skillRaw)
    }

    const preliminary = parseSkillMarkdown(
      skillId,
      bundledSkillFolder(skillId),
      propertiesRaw,
      skillRaw,
    )
    if (!preliminary) continue

    const skillActionTools = tagToolsForSkill(
      getBundledSkillActionTools(skillId),
      skillId,
    )

    const allowedForCatalog = expandSkillAllowedToolsForCatalog(
      skillId,
      globalTools,
      preliminary.properties.allowedTools,
    )
    const resolvedTools = resolveSkillToolCatalog(
      globalTools,
      skillActionTools,
      allowedForCatalog,
      skillId,
    )

    const skill = parseSkillMarkdown(
      skillId,
      bundledSkillFolder(skillId),
      propertiesRaw,
      skillRaw,
      undefined,
      undefined,
      resolvedTools,
    )
    if (!skill) continue

    skill.actionToolNames = skillActionTools.map((tool) => tool.name)
    skills.push(skill)
  }

  return skills
}

export function verifyBundledSkillsCatalog(): void {
  verifyBundledSkillsManifest()
}
