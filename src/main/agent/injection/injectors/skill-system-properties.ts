import { getSystemPropValues } from '@config/system-prop'
import { buildSkillSystemPropertiesInstructionsBlock } from '@shared/skills/skill-system-property-instructions'
import { skillSystemPropertyKeys } from '@shared/skills/skill-system-properties'
import type { AgentStepContext } from '../../context'
import type { AgentInjector } from '../types'
import { INJECTOR_ORDER } from './orders'

export function buildSkillSystemPropertiesBlock(
  ctx: AgentStepContext,
): string {
  const specs = ctx.opts.systemProperties
  if (!specs?.length) return ''
  const keys = skillSystemPropertyKeys(specs)
  const values = getSystemPropValues(keys)
  return buildSkillSystemPropertiesInstructionsBlock(specs, values)
}

export const skillSystemPropertiesInjector: AgentInjector = {
  id: 'skill-system-properties',
  order: INJECTOR_ORDER.SKILL_SYSTEM_PROPERTIES,
  applies({ profile, ctx }) {
    if (profile.stage !== 'toolLoop') return false
    return (ctx.opts.systemProperties?.length ?? 0) > 0
  },
  injectInstructions({ ctx }) {
    const block = buildSkillSystemPropertiesBlock(ctx)
    return block || null
  },
}
