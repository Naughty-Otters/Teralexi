import type { AgentInjector, InjectionRunContext } from '../types'
import type { AgentStepContext } from '../../context'
import { INJECTOR_ORDER } from './orders'

export function buildSkillsInstructionsBlock(ctx: AgentStepContext): string {
  const skills = ctx.executionSteps?.skills?.trim()
  if (!skills) return ''
  return `### Skill instructions\n\n${skills}`
}

export const skillsInjector: AgentInjector = {
  id: 'skills',
  order: INJECTOR_ORDER.SKILLS,
  applies({ profile }) {
    return profile.stage === 'toolLoop'
  },
  injectInstructions({ ctx }) {
    const block = buildSkillsInstructionsBlock(ctx)
    return block || null
  },
}
