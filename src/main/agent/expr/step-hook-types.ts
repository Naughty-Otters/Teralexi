import type { StepExpressionPlan } from './expression-plan'

export type StepHookResult = {
  body: string
  formatted: string
  plan: StepExpressionPlan
  displayTitle: string
  stepGoal?: string
}
