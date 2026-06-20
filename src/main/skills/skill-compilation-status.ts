import { readFileSync } from 'fs'
import { join } from 'path'
import { createLogger } from '@main/logger'
import { getConversationStore } from '@main/services/conversation-store'
import { SKILL_FILES } from './constants'
import { computeSkillSourceFingerprint, compileSkill } from './skill-compiler'
import { formatCompileError, shortFingerprint } from './skill-compiler-log'
import {
  resolveLoadableSkillIds,
  resolvePropertiesRaw,
  resolveSkillCompilationSource,
  resolveSkillFolder,
  extractYamlFrontmatterBlock,
  stripYamlFrontmatter,
} from './skill-path'
import { parseSkillMarkdown } from './skill-markdown'
import { loadSkillCompileSettings } from './skill-compile-settings'
import {
  resolveSkillCompileLlm,
  type SkillCompileLlmSource,
} from '@shared/agent/skill-compile-settings'
import type { SkillProvider } from './types'

const log = createLogger('skills.compilation')

export type SkillCompilationListItem = {
  skillId: string
  name: string
  status: 'pending' | 'ready' | 'failed' | 'missing'
  source: 'bundled' | 'user' | null
  diskFingerprint: string
  storedFingerprint: string
  stale: boolean
  compiledAt: string | null
  errorMessage: string | null
  skillProvider: SkillProvider
  skillModel: string
  compileProvider: SkillProvider
  compileModel: string
  compileLlmSource: SkillCompileLlmSource
}

export type SkillCompilationBatchResult = {
  skillId: string
  status: 'pending' | 'ready' | 'failed' | 'missing'
  errorMessage: string | null
}

function readSkillProperties(skillId: string) {
  const folder = resolveSkillFolder(skillId)
  if (!folder) return null
  try {
    let skillMd = readFileSync(join(folder, SKILL_FILES.SKILL_MD), 'utf-8')
    const propertiesRaw = resolvePropertiesRaw(skillId, folder, skillMd)
    if (extractYamlFrontmatterBlock(skillMd)) {
      skillMd = stripYamlFrontmatter(skillMd)
    }
    return parseSkillMarkdown(
      skillId,
      folder,
      propertiesRaw,
      skillMd,
      undefined,
      undefined,
    )
  } catch {
    return null
  }
}

function skillDisplayName(skillId: string): string {
  return readSkillProperties(skillId)?.properties.name?.trim() || skillId
}

export function listSkillCompilationStatuses(): SkillCompilationListItem[] {
  const store = getConversationStore()
  const compileSettings = loadSkillCompileSettings()
  const items = resolveLoadableSkillIds()
    .sort((a, b) => a.localeCompare(b))
    .map((skillId) => {
      const diskFingerprint = computeSkillSourceFingerprint(skillId)
      const source = resolveSkillCompilationSource(skillId)
      const row = store.getEffectiveSkillCompilation(skillId)
      const storedFingerprint = row?.sourceFingerprint ?? ''
      const stale =
        Boolean(diskFingerprint) &&
        row?.status === 'ready' &&
        storedFingerprint !== diskFingerprint

      const properties = readSkillProperties(skillId)
      const skillProvider = properties?.properties.provider ?? 'ollama'
      const skillModel = properties?.properties.model ?? ''
      const compileLlm = resolveSkillCompileLlm(
        skillId,
        { provider: skillProvider, model: skillModel },
        compileSettings,
      )

      return {
        skillId,
        name: skillDisplayName(skillId),
        status: row?.status ?? 'missing',
        source,
        diskFingerprint,
        storedFingerprint,
        stale,
        compiledAt: row?.compiledAt ?? null,
        errorMessage: row?.errorMessage ?? null,
        skillProvider,
        skillModel,
        compileProvider: compileLlm.provider,
        compileModel: compileLlm.model,
        compileLlmSource: compileLlm.source,
      }
    })

  const ready = items.filter((i) => i.status === 'ready').length
  const failed = items.filter((i) => i.status === 'failed').length
  const stale = items.filter((i) => i.stale).length
  log.info(
    {
      skillCount: items.length,
      ready,
      failed,
      stale,
      missing: items.length - ready - failed,
    },
    'skill compilation: listed statuses',
  )

  return items
}

export async function compileAllSkills(options?: {
  force?: boolean
}): Promise<SkillCompilationBatchResult[]> {
  const force = !!options?.force
  const ids = resolveLoadableSkillIds().sort((a, b) => a.localeCompare(b))
  const results: SkillCompilationBatchResult[] = []

  log.info(
    { skillCount: ids.length, force, skillIds: ids },
    'skill compilation: batch start',
  )

  const started = Date.now()
  for (let index = 0; index < ids.length; index++) {
    const skillId = ids[index]!
    log.info(
      { skillId, index: index + 1, total: ids.length, force },
      'skill compilation: batch item start',
    )
    try {
      await compileSkill(skillId, { force })
      const row = getConversationStore().getEffectiveSkillCompilation(skillId)
      const result: SkillCompilationBatchResult = {
        skillId,
        status: row?.status ?? 'missing',
        errorMessage: row?.errorMessage ?? null,
      }
      results.push(result)

      if (result.status === 'failed') {
        log.error(
          {
            skillId,
            index: index + 1,
            total: ids.length,
            errorMessage: result.errorMessage,
          },
          'skill compilation: batch item failed',
        )
      } else {
        log.info(
          {
            skillId,
            index: index + 1,
            total: ids.length,
            status: result.status,
            fingerprint: shortFingerprint(row?.sourceFingerprint ?? ''),
          },
          'skill compilation: batch item done',
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        skillId,
        status: 'failed',
        errorMessage: message,
      })
      log.error(
        {
          skillId,
          index: index + 1,
          total: ids.length,
          ...formatCompileError(err),
        },
        'skill compilation: batch item threw',
      )
    }
  }

  const ready = results.filter((r) => r.status === 'ready').length
  const failed = results.filter((r) => r.status === 'failed').length
  log.info(
    {
      skillCount: ids.length,
      ready,
      failed,
      other: ids.length - ready - failed,
      durationMs: Date.now() - started,
      force,
      failedSkillIds: results
        .filter((r) => r.status === 'failed')
        .map((r) => r.skillId),
    },
    'skill compilation: batch complete',
  )

  return results
}
