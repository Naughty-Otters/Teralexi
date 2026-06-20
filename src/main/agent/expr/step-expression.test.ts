import { describe, expect, it } from 'vitest'
import type { AgentFlowContext } from '../context'
import { buildExpressionLlmCallParams } from './llm-call-params'
import { resolveHarnessBranch, resolveToolForHarness } from './execute-expression'
import { PLANNING_STEP_ID, SUMMARY_STEP_ID } from '../constants/step-ids'
import { TOOL_LOOP_STEP_ID } from '../constants/step-ids'
import { expr, StepExpression } from './step-expression'

describe('StepExpression mapping', () => {
  it('serializes system_msg → instructions and prompt → userPrompt', () => {
    const plan = expr
      .system_msg('Sys instructions')
      .prompt('User task')
      .toPlan()

    expect(plan.instructions).toBe('Sys instructions')
    expect(plan.userPrompt).toBe('User task')

    const llm = buildExpressionLlmCallParams(plan, [
      { role: 'user', content: 'history' },
    ])
    expect(llm.instructions).toBe('Sys instructions')
    expect(llm.messages.at(-1)).toEqual({ role: 'user', content: 'User task' })
  })

  it('maps tool and else_tool separately', () => {
    const plan = expr.tool('web_scrape').else_tool('fallback_scrape').toPlan()
    expect(plan.tool).toBe('web_scrape')
    expect(plan.elseTool).toBe('fallback_scrape')
  })

  it('maps else_goto to plan.elseGoto', () => {
    const plan = expr
      .when('nonEmpty')
      .else_goto(PLANNING_STEP_ID)
      .toPlan()
    expect(plan.elseGoto).toBe(PLANNING_STEP_ID)
  })

  it('when is harness-only, not pipeline precondition', () => {
    const entry = expr.when('nonEmpty').toPipelineEntry(TOOL_LOOP_STEP_ID)
    expect(entry.when).toBeUndefined()
    const plan = expr.when('nonEmpty').toPlan()
    expect(plan.whenHarness).toBeTypeOf('function')
  })

  it('precondition sets pipeline entry.when', () => {
    const entry = expr.precondition('hasToolLoop').toPipelineEntry(TOOL_LOOP_STEP_ID)
    expect(entry.when).toBeTypeOf('function')
  })
})

describe('tool branch selection', () => {
  const ctx = {} as AgentFlowContext

  it('uses tool when harness passes', () => {
    const plan = expr
      .when('nonEmpty')
      .tool('web_scrape')
      .else_tool('fallback')
      .toPlan()
    const pick = resolveToolForHarness(plan, ctx, 'hello')
    expect(pick.toolName).toBe('web_scrape')
    expect(pick.whenHarnessPassed).toBe(true)
  })

  it('uses else_tool when harness fails', () => {
    const plan = expr
      .when('nonEmpty')
      .tool('web_scrape')
      .else_tool('fallback')
      .toPlan()
    const pick = resolveToolForHarness(plan, ctx, '')
    expect(pick.toolName).toBe('fallback')
    expect(pick.whenHarnessPassed).toBe(false)
  })

  it('uses tool when when is omitted', () => {
    const plan = expr.tool('only').toPlan()
    const pick = resolveToolForHarness(plan, ctx, '')
    expect(pick.toolName).toBe('only')
  })

  it('uses else_goto when harness fails', () => {
    const plan = expr
      .when('nonEmpty')
      .tool('web_scrape')
      .else_goto(SUMMARY_STEP_ID)
      .toPlan()
    const branch = resolveHarnessBranch(plan, ctx, '')
    expect(branch.gotoStageId).toBe(SUMMARY_STEP_ID)
    expect(branch.toolName).toBeUndefined()
  })

  it('prefers else_goto over else_tool when harness fails', () => {
    const plan = expr
      .when('nonEmpty')
      .tool('web_scrape')
      .else_tool('fallback')
      .else_goto(PLANNING_STEP_ID)
      .toPlan()
    const branch = resolveHarnessBranch(plan, ctx, '')
    expect(branch.gotoStageId).toBe(PLANNING_STEP_ID)
    expect(branch.toolName).toBeUndefined()
  })
})
