import { describe, expect, it } from 'vitest'
import { forEachSkillStepDefinition } from './foreach-skill-step'
import type { StepOutputEntry } from './step-io'
import type { StepRunContext } from '../flow/step-hook'

const sampleData = {
  tasks: [{ agentId: 'coding', task: 'Implement feature' }],
  results: [
    ['coding', 'Done implementing'],
    ['review', 'Looks good'],
  ] as Array<[string, string]>,
}

function makeEntries(data = sampleData): StepOutputEntry[] {
  return [
    {
      stepId: 'forEachSkill',
      instanceKey: 'fs:1',
      data,
      timestamp: '2026-01-01T00:00:00Z',
    },
  ]
}

describe('forEachSkillStepDefinition', () => {
  it('shouldRun is true when skill chain plan has tasks', () => {
    expect(
      forEachSkillStepDefinition.shouldRun?.({
        flow: { skillChainPlan: { tasks: [{ agentId: 'a', task: 't' }] } },
      } as StepRunContext),
    ).toBe(true)
  })

  it('shouldRun is false without tasks', () => {
    expect(
      forEachSkillStepDefinition.shouldRun?.({
        flow: { skillChainPlan: { tasks: [] } },
      } as StepRunContext),
    ).toBe(false)
    expect(
      forEachSkillStepDefinition.shouldRun?.({
        flow: {},
      } as StepRunContext),
    ).toBe(false)
  })

  it('toContextMessages formats prior agent outputs', () => {
    const msgs = forEachSkillStepDefinition.toContextMessages!(makeEntries())
    expect(msgs).toHaveLength(1)
    expect(msgs[0]?.role).toBe('user')
    expect(msgs[0]?.content).toContain('[coding output]')
    expect(msgs[0]?.content).toContain('Done implementing')
  })

  it('toContextMessages returns empty when no results', () => {
    expect(
      forEachSkillStepDefinition.toContextMessages!(
        makeEntries({ tasks: [], results: [] }),
      ),
    ).toEqual([])
  })

  it('toSubStep renders markdown agent sections', () => {
    const sub = forEachSkillStepDefinition.toSubStep!(makeEntries())
    expect(sub).toEqual({
      type: 'SkillsToolExecutionStep',
      title: forEachSkillStepDefinition.title,
      content: expect.stringContaining('**coding**'),
    })
  })

  it('toStepCapture mirrors sub-step content', () => {
    const cap = forEachSkillStepDefinition.toStepCapture!(makeEntries())
    expect(cap?.stepType).toBe('SkillsToolExecutionStep')
    expect(cap?.outputPaths).toEqual([])
    expect(cap?.content).toContain('**review**')
  })

  it('hasOutput reflects results presence', () => {
    expect(forEachSkillStepDefinition.hasOutput!(makeEntries())).toBe(true)
    expect(
      forEachSkillStepDefinition.hasOutput!(
        makeEntries({ tasks: [], results: [] }),
      ),
    ).toBe(false)
  })
})
