/**
 * Resolve per-step prompts for skill-backed agents.
 *
 * Load contract:
 * 1. Full skill.md body from the skill package is the default tool-loop instructions.
 * 2. Non-empty `agent_configurations.skills_prompt` is an advanced user override.
 * 3. Compiled artifact supplies thinking + validation only (not the main instructions text).
 */

export type CompiledSkillPromptSources = {
  thinking?: { instructions?: string }
  instructions?: { instructions?: string }
  validation?: { rules?: string[] }
}

export type SkillPromptSources = {
  systemPrompt?: string
  skillsPrompt?: string
  executionSteps?: {
    thinking?: string
    skills?: string
    validation?: string[]
  }
}

export type SavedSkillPrompts = {
  systemPrompt?: string
  skillsPrompt?: string
}

export type ResolvedSkillAgentConfiguration = {
  systemPrompt: string
  skillsPrompt: string
}

export function resolveSkillStepPrompt(
  saved: string | undefined,
  fromSkill: string | undefined,
  fromExecutionSteps?: string,
): string {
  const savedTrim = (saved ?? '').trim()
  if (savedTrim.length > 0) return savedTrim
  const skillTrim = (fromSkill ?? '').trim()
  if (skillTrim.length > 0) return skillTrim
  return (fromExecutionSteps ?? '').trim()
}

/** Full skill.md first; compiled artifact is not used for the main skills prompt. */
export function resolveCompiledSkillPrompts(
  skill: SkillPromptSources,
  _compiled?: CompiledSkillPromptSources | null,
  saved?: SavedSkillPrompts,
): ResolvedSkillAgentConfiguration {
  const fromDisk = resolveSkillAgentPrompts(skill, undefined)

  return {
    skillsPrompt: resolveSkillStepPrompt(saved?.skillsPrompt, fromDisk.skillsPrompt),
    systemPrompt: (skill.systemPrompt ?? '').trim(),
  }
}

/** Merges skill package / executionSteps prompts with optional DB overrides. */
export function resolveSkillAgentPrompts(
  skill: SkillPromptSources,
  saved?: SavedSkillPrompts,
): ResolvedSkillAgentConfiguration {
  const steps = skill.executionSteps
  const skillsPrompt = resolveSkillStepPrompt(
    saved?.skillsPrompt,
    skill.skillsPrompt,
    steps?.skills,
  )
  return {
    skillsPrompt,
    systemPrompt: (skill.systemPrompt ?? '').trim(),
  }
}

/** Merges compiled / skill package with optional DB overrides. */
export function resolveSkillAgentConfiguration(
  skill: SkillPromptSources,
  saved?: SavedSkillPrompts,
  compiled?: CompiledSkillPromptSources | null,
): ResolvedSkillAgentConfiguration {
  return compiled
    ? resolveCompiledSkillPrompts(skill, compiled, saved)
    : resolveSkillAgentPrompts(skill, saved)
}

/** Skill agents no longer seed raw markdown prompts into agent_configurations. */
export function skillAgentPromptsNeedSeed(
  _saved: SavedSkillPrompts | undefined,
  _skill: SkillPromptSources,
): boolean {
  return false
}

/** @deprecated Prefer {@link skillAgentPromptsNeedSeed}. */
export function skillPromptsNeedSeed(
  saved: SavedSkillPrompts | undefined,
  skill: SkillPromptSources,
): boolean {
  return skillAgentPromptsNeedSeed(saved, skill)
}
