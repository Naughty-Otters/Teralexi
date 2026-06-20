import type { ConfigContext } from '../config/context'
import type { FlowStepConfig } from './pipeline'

/** Optional per-pipeline overrides for a stage's LLM system prompt and user instructions. */
export type FlowStepPromptOverrides = {
  systemMessage?: string
  instructions?: string
}

export type CustomStepOptions = FlowStepPromptOverrides & {
  /** UI title for this stage (default: "Custom prompt"). */
  title?: string
}

export function resolveFlowStepSystem(
  config: FlowStepConfig | undefined,
  configCtx: ConfigContext,
  defaultSystem: string,
  responseLanguage?: string,
): string {
  const raw = config?.systemMessage?.trim() || defaultSystem
  return configCtx.withResponseLanguageInstruction(raw, responseLanguage)
}

export function resolveFlowStepInstructions(
  config: FlowStepConfig | undefined,
  defaultInstructions: string,
): string {
  const override = config?.instructions?.trim()
  return override || defaultInstructions
}

/**
 * Tool-loop {@link Agent} `instructions` from expression `system_msg` only.
 * User `prompt` is not merged here — it belongs on the user message / expression executor.
 */
export function resolveFlowStepExecutorInstructions(
  config: FlowStepConfig | undefined,
  builtInstructions: string,
): string {
  const fromExpression = config?.expressionPlan?.instructions?.trim()
  if (fromExpression) return fromExpression
  const system = config?.systemMessage?.trim()
  if (system) return system
  const legacy = config?.instructions?.trim()
  if (legacy && !config?.userPrompt?.trim()) return legacy
  return builtInstructions
}
