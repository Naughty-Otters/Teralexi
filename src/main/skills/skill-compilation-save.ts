import { createLogger } from '@main/logger'
import { getConversationStore } from '@main/services/conversation-store'
import {
  parseSkillCompiledArtifact,
  type SkillCompiledArtifact,
} from './skill-compiled-schema'
import { computeSkillSourceFingerprint } from './skill-compiler'
import { shortFingerprint } from './skill-compiler-log'
import { resolveSkillCompilationSource } from './skill-path'

const log = createLogger('skills.compilation')

export type SaveSkillCompilationResult =
  | {
      ok: true
      compiled: SkillCompiledArtifact
      fingerprint: string
      compiledAt: string
    }
  | { ok: false; errorMessage: string }

/** Persist a user-edited compiled artifact (validated; does not re-run LLM). */
export function saveSkillCompilation(
  skillId: string,
  rawCompiled: unknown,
): SaveSkillCompilationResult {
  const trimmedId = skillId.trim()
  const source = resolveSkillCompilationSource(trimmedId)
  if (!source) {
    return { ok: false, errorMessage: 'Skill folder not found' }
  }

  const fingerprint = computeSkillSourceFingerprint(trimmedId)
  let parsed: SkillCompiledArtifact
  try {
    parsed = parseSkillCompiledArtifact(rawCompiled)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn(
      { skillId: trimmedId, errorMessage: message },
      'skill compilation save: validation failed',
    )
    return { ok: false, errorMessage: message }
  }

  parsed = {
    ...parsed,
    skillId: trimmedId,
    sourceFingerprint: fingerprint,
  }

  const compiledAt = new Date().toISOString()
  getConversationStore().upsertSkillCompilation({
    skillId: trimmedId,
    source,
    sourceFingerprint: fingerprint,
    status: 'ready',
    compiled: parsed,
    errorMessage: null,
    compiledAt,
  })

  log.info(
    {
      skillId: trimmedId,
      source,
      fingerprint: shortFingerprint(fingerprint),
      instructionChars: parsed.instructions.instructions.length,
      validationRuleCount: parsed.validation.rules.length,
    },
    'skill compilation save: success',
  )

  return { ok: true, compiled: parsed, fingerprint, compiledAt }
}
