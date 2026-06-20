import { z } from 'zod'
import { normalizeSkillCompiledArtifactInput } from './skill-compiled-normalize'

export const SKILL_COMPILED_VERSION = 2 as const

export type SkillCompilationSource = 'bundled' | 'user'
export type SkillCompilationStatus = 'pending' | 'ready' | 'failed'

export const skillCompiledArtifactSchema = z.object({
  version: z.literal(SKILL_COMPILED_VERSION),
  skillId: z.string(),
  sourceFingerprint: z.string(),
  thinking: z.object({
    instructions: z.string(),
  }),
  /** Tool-loop agent instructions (maps to executionSteps.skills). */
  instructions: z.object({
    instructions: z.string(),
  }),
  validation: z.object({
    rules: z.array(z.string()),
  }),
})

export type SkillCompiledArtifact = z.infer<typeof skillCompiledArtifactSchema>

/** JSON schema description for the compile LLM (documentation only). */
export const SKILL_COMPILE_JSON_SCHEMA_HINT = `{
  "version": 2,
  "skillId": "<folder id>",
  "sourceFingerprint": "<copied from input>",
  "thinking": { "instructions": "..." },
  "instructions": { "instructions": "..." },
  "validation": { "rules": ["..."] }
}`

export function parseSkillCompiledArtifact(
  raw: unknown,
): SkillCompiledArtifact {
  return skillCompiledArtifactSchema.parse(
    normalizeSkillCompiledArtifactInput(raw),
  )
}
