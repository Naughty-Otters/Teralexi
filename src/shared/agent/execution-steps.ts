import { resolveToolLoopMaxIterations } from './tool-loop'

export type NormalizableExecutionAgent<TTool = unknown> = {
  skillsPrompt?: string
  /** Per-agent cap on tool-loop steps (UI + persistence). */
  toolLoopMaxIterations?: number
  availableSkillTools?: TTool[]
  executionSteps?: {
    thinking?: string
    skills?: string
    validation?: string[]
    toolLoop?: {
      tools?: TTool[]
      maxIterations?: number
    }
  }
  /** @deprecated Ignored — stripped on normalize. */
  planningPrompt?: string
  /** @deprecated Ignored — stripped on normalize. */
  summaryPrompt?: string
  /** @deprecated Ignored — stripped on normalize. */
  reportPrompt?: string
}

export type NormalizedExecutionSteps<TTool = unknown> = {
  thinking?: string
  skills?: string
  validation?: string[]
  toolLoop?: {
    tools: TTool[]
    maxIterations?: number
  }
}

/**
 * Builds a single execution-steps object from per-step prompts and tool metadata.
 * Used by main-process engine and renderer agent store.
 */
export function normalizeExecutionSteps<TTool = unknown>(
  agent: NormalizableExecutionAgent<TTool>,
): NormalizedExecutionSteps<TTool> | undefined {
  const existing = agent.executionSteps
  const tools = agent.availableSkillTools ?? existing?.toolLoop?.tools ?? []
  const maxIterations = resolveToolLoopMaxIterations(
    agent.toolLoopMaxIterations ?? existing?.toolLoop?.maxIterations,
  )

  const thinking = (existing?.thinking ?? '').trim()
  const skills =
    (agent.skillsPrompt ?? '').trim() || (existing?.skills ?? '').trim()
  const validation = (existing?.validation ?? []).filter((r) => r.trim().length > 0)

  const hasContent =
    thinking.length > 0 ||
    skills.length > 0 ||
    validation.length > 0 ||
    tools.length > 0

  if (!hasContent) return undefined

  return {
    thinking: thinking || undefined,
    skills: skills || undefined,
    validation: validation.length > 0 ? validation : undefined,
    toolLoop:
      tools.length > 0
        ? {
            tools,
            maxIterations,
          }
        : agent.toolLoopMaxIterations != null
          ? {
              tools: [] as TTool[],
              maxIterations,
            }
          : undefined,
  }
}
