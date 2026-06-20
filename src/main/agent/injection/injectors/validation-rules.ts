import type { AgentInjector } from '../types'
import type { AgentStepContext } from '../../context'
import { INJECTOR_ORDER } from './orders'

export function buildValidationRulesBlock(ctx: AgentStepContext): string {
  const rules = (ctx.executionSteps?.validation ?? []).filter((r) => r.trim())
  if (rules.length === 0) return ''
  return ['### Validation rules', '', ...rules.map((r) => `- ${r}`)].join('\n')
}

export const validationRulesInjector: AgentInjector = {
  id: 'validation-rules',
  order: INJECTOR_ORDER.VALIDATION_RULES,
  applies({ profile, ctx }) {
    if (profile.stage !== 'toolLoop') return false
    return (ctx.executionSteps?.validation ?? []).some((r) => r.trim())
  },
  injectInstructions({ ctx }) {
    const block = buildValidationRulesBlock(ctx)
    return block || null
  },
}
