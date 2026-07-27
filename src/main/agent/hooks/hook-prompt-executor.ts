import { generateText } from 'ai'
import type {
  HookInvocationContext,
  HookRunResult,
  HookSpecificOutput,
  RunnablePromptHookBinding,
} from '@shared/agent/hooks'
import { BLOCKING_HOOK_EVENTS } from '@shared/agent/hooks'
import type { ProviderType } from '@shared/agent/llm-provider-registry'
import { createModelForProvider } from '@main/agent/providers/adapters'
import type { ProviderCredentials } from '@main/agent/types'
import type { HookResult } from '@teralexi/skill-sdk'
import type { RunUserHooksOptions } from './user-hooks'

const PROMPT_HOOK_RESPONSE_SCHEMA = `Reply with ONLY a JSON object:
{"continue":boolean,"stopReason"?:string,"hookSpecificOutput"?:{"additionalContext"?:string,"updatedInput"?:object,"permissionDecision"?:"allow"|"deny"|"ask"}}`

export type ParsedModelChoice = {
  provider: string
  model: string
}

export function parseHookModelChoice(
  modelSpec: string | undefined,
  fallback?: { provider?: string; model?: string },
): ParsedModelChoice | null {
  const spec = modelSpec?.trim() || ''
  if (spec.includes(':')) {
    const [provider, ...rest] = spec.split(':')
    const model = rest.join(':').trim()
    if (provider?.trim() && model) {
      return { provider: provider.trim(), model }
    }
  }
  if (fallback?.provider?.trim() && (spec || fallback.model?.trim())) {
    return {
      provider: fallback.provider.trim(),
      model: (spec || fallback.model || '').trim(),
    }
  }
  return null
}

function parseHookResultText(text: string): HookResult | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as HookResult
    if (typeof parsed.continue !== 'boolean') return null
    return parsed
  } catch {
    return null
  }
}

function hookResultToRunResult(
  event: HookInvocationContext['event'],
  result: HookResult,
): HookRunResult {
  if (!result.continue) {
    return {
      blocked: BLOCKING_HOOK_EVENTS.has(event),
      message: result.stopReason ?? 'Blocked by prompt hook',
      hookSpecificOutput: result.hookSpecificOutput,
    }
  }
  return {
    blocked: false,
    ...(result.hookSpecificOutput ? { hookSpecificOutput: result.hookSpecificOutput } : {}),
  }
}

export async function execPromptHook(
  binding: RunnablePromptHookBinding,
  ctx: HookInvocationContext,
  options?: RunUserHooksOptions,
): Promise<HookRunResult> {
  const credentials = options?.credentials
  if (!credentials) {
    return {
      blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
      message: 'Prompt hook requires credentials (pass via runUserHooks options)',
    }
  }

  const modelChoice = parseHookModelChoice(binding.model, {
    provider: options?.defaultProvider,
    model: options?.defaultModel,
  })
  if (!modelChoice) {
    return {
      blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
      message: 'Prompt hook requires a model (binding.model or defaultProvider/defaultModel)',
    }
  }

  try {
    const model = createModelForProvider(
      modelChoice.provider as ProviderType,
      modelChoice.model,
      credentials,
    )
    const prompt = [
      binding.prompt.trim(),
      '',
      PROMPT_HOOK_RESPONSE_SCHEMA,
      '',
      'Hook context JSON:',
      JSON.stringify(ctx, null, 2),
    ].join('\n')

    const { text } = await generateText({
      model: model as Parameters<typeof generateText>[0]['model'],
      prompt,
      maxOutputTokens: 1024,
    })

    const parsed = parseHookResultText(text)
    if (!parsed) {
      const hookSpecificOutput = parseHookStdoutAsOutput(text)
      if (hookSpecificOutput) {
        return { blocked: false, hookSpecificOutput }
      }
      return {
        blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
        message: 'Prompt hook returned non-JSON output',
      }
    }
    return hookResultToRunResult(ctx.event, parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      blocked: BLOCKING_HOOK_EVENTS.has(ctx.event),
      message: `Prompt hook failed: ${message}`,
    }
  }
}

function parseHookStdoutAsOutput(text: string): HookSpecificOutput | undefined {
  const parsed = parseHookResultText(text)
  return parsed?.hookSpecificOutput
}
