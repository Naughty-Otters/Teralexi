import { SKILL_COMPILED_VERSION } from './skill-compiled-schema'

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function deepCamelCaseKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepCamelCaseKeys)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeToCamel(k)] = deepCamelCaseKeys(v)
    }
    return out
  }
  return value
}

function asString(value: unknown, fallback = ''): string {
  if (value == null) return fallback
  return String(value).trim()
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

/** Coerce LLM compile JSON (v1 or v2) into v2 shape for Zod. */
export function normalizeSkillCompiledArtifactInput(
  raw: unknown,
): unknown {
  const camel = deepCamelCaseKeys(raw)
  if (!camel || typeof camel !== 'object') return camel

  const root = camel as Record<string, unknown>

  const thinking =
    root.thinking && typeof root.thinking === 'object'
      ? (root.thinking as Record<string, unknown>)
      : {}

  const instructionsBlock =
    root.instructions && typeof root.instructions === 'object'
      ? (root.instructions as Record<string, unknown>)
      : root.execution && typeof root.execution === 'object'
        ? (root.execution as Record<string, unknown>)
        : {}

  const validationBlock =
    root.validation && typeof root.validation === 'object'
      ? (root.validation as Record<string, unknown>)
      : root.summary && typeof root.summary === 'object'
        ? (root.summary as Record<string, unknown>)
        : {}

  const thinkingInstructions = asString(
    thinking.instructions ?? thinking.prompt ?? root.thinkingInstructions,
  )

  const instructionText = asString(
    instructionsBlock.instructions ??
      instructionsBlock.prompt ??
      root.skillsInstructions,
  )

  let validationRules = asStringArray(
    validationBlock.rules ??
      validationBlock.validationRules ??
      validationBlock.validation_rules,
  )

  if (validationRules.length === 0) {
    const summary =
      root.summary && typeof root.summary === 'object'
        ? (root.summary as Record<string, unknown>)
        : {}
    validationRules = asStringArray(
      summary.validationRules ?? summary.validation_rules ?? summary.rules,
    )
  }

  return {
    version: SKILL_COMPILED_VERSION,
    skillId: asString(root.skillId ?? root.skill_id),
    sourceFingerprint: asString(
      root.sourceFingerprint ?? root.source_fingerprint,
    ),
    thinking: {
      instructions: thinkingInstructions,
    },
    instructions: {
      instructions: instructionText,
    },
    validation: {
      rules: validationRules,
    },
  }
}
