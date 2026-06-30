import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { createLogger } from '@main/logger'
import { SKILL_FILES, SKILL_LOADER_LOG } from './constants'
import type { SkillDefinition } from './skill-models'
import type { SkillTool } from './types'
import {
  extractYamlFrontmatterBlock,
  isLoadableSkillFolder,
  normalizeSkillFileText,
  resolvePropertiesRaw,
  resolveUserSkillsDirectory,
  stripYamlFrontmatter,
} from './skill-path'
import { buildBundledSkillDefinitions } from './bundled-skills'
import { parseSkillMarkdown } from './skill-markdown'
import { loadSkillActions, loadToolSetTools } from './skill-module-loader'
import {
  resolveSkillToolCatalog,
  tagToolsForSkill,
} from './resolve-skill-tools'
import { expandSkillAllowedToolsForCatalog } from '@shared/agent/skill-workspace-tool-defaults'
import {
  getConversationStore,
  type ConversationStore,
} from '@main/services/conversation-store'

const log = createLogger('skills.loader')

function attachSkillCompilationFromStore(
  skill: SkillDefinition,
  store: ConversationStore,
): void {
  const row = store.getEffectiveSkillCompilation(skill.id)
  skill.compiledArtifact = row?.compiled ?? undefined
  skill.compilationStatus = row?.status ?? 'missing'
  const status = row?.status ?? 'missing'
  if (status === 'ready' && row?.compiled) {
    log.debug(
      {
        skillId: skill.id,
        source: row.source,
        compiledAt: row.compiledAt,
      },
      'skill load: using compiled artifact from DB',
    )
  } else if (status === 'failed') {
    log.warn(
      {
        skillId: skill.id,
        source: row?.source,
        errorMessage: row?.errorMessage,
      },
      'skill load: compile failed — disk markdown fallback at runtime',
    )
  } else {
    log.debug(
      { skillId: skill.id, status },
      'skill load: no compiled artifact — disk markdown fallback at runtime',
    )
  }
}

export async function loadSkillsFromDirectory(
  skillsDir: string,
  options?: { globalTools?: SkillTool[] },
): Promise<SkillDefinition[]> {
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true })
    return []
  }

  const skills: SkillDefinition[] = []
  let entries: string[]

  try {
    entries = readdirSync(skillsDir)
  } catch (err) {
    log.warn('Failed to read skills directory', { skillsDir, err })
    return []
  }

  const globalTools = options?.globalTools ?? (await loadToolSetTools())

  for (const entry of entries) {
    if (!isLoadableSkillFolder(skillsDir, entry)) continue

    const skillFolder = join(skillsDir, entry)
    const skillFile = join(skillFolder, SKILL_FILES.SKILL_MD)

    try {
      let skillRaw = normalizeSkillFileText(readFileSync(skillFile, 'utf-8'))
      const propertiesRaw = resolvePropertiesRaw(entry, skillFolder, skillRaw)
      if (extractYamlFrontmatterBlock(skillRaw)) {
        skillRaw = stripYamlFrontmatter(skillRaw)
      }

      const preliminary = parseSkillMarkdown(
        entry,
        skillFolder,
        propertiesRaw,
        skillRaw,
      )
      if (!preliminary) {
        log.warn('Skipped skill folder: failed to parse skill markdown', {
          skillId: entry,
          skillFolder,
        })
        continue
      }

      const skillActionTools = tagToolsForSkill(
        await loadSkillActions(skillFolder, []),
        entry,
      )

      const allowedForCatalog = expandSkillAllowedToolsForCatalog(
        entry,
        globalTools,
        preliminary.properties.allowedTools,
      )
      const resolvedTools = resolveSkillToolCatalog(
        globalTools,
        skillActionTools,
        allowedForCatalog,
        entry,
      )

      const skill = parseSkillMarkdown(
        entry,
        skillFolder,
        propertiesRaw,
        skillRaw,
        undefined,
        undefined,
        resolvedTools,
      )
      if (skill) {
        skill.actionToolNames = skillActionTools.map((tool) => tool.name)
        skills.push(skill)
        continue
      }
      log.warn(SKILL_LOADER_LOG.SKIPPED_INVALID, {
        skillId: entry,
        folder: skillFolder,
      })
    } catch (err) {
      log.warn(SKILL_LOADER_LOG.SKIPPED_FAILED, {
        skillId: entry,
        folder: skillFolder,
        err,
      })
    }
  }

  log.info(SKILL_LOADER_LOG.LOADED, {
    skillsDir,
    count: skills.length,
    skillIds: skills.map((s) => s.id),
  })

  return skills
}

/**
 * Loads skills from statically bundled defaults and `~/.openfde/skills`, merged by id.
 * User skills overwrite bundled skills with the same folder name.
 */
export async function loadSkills(): Promise<SkillDefinition[]> {
  const globalTools = await loadToolSetTools()
  const byId = new Map<string, SkillDefinition>()
  for (const skill of await buildBundledSkillDefinitions(globalTools)) {
    byId.set(skill.id, skill)
  }

  const userSkillsDir = resolveUserSkillsDirectory()
  const userSkills = await loadSkillsFromDirectory(userSkillsDir, { globalTools })
  for (const skill of userSkills) {
    byId.set(skill.id, skill)
  }

  const merged = Array.from(byId.values())

  const store = getConversationStore()
  for (const skill of merged) {
    attachSkillCompilationFromStore(skill, store)
  }

  log.info(SKILL_LOADER_LOG.LOADED, {
    sources: ['bundled:main.js', userSkillsDir],
    count: merged.length,
    skillIds: merged.map((s) => s.id),
  })
  return merged
}
