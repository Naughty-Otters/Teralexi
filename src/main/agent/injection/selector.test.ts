import { describe, expect, it } from 'vitest'
import { resolveInjectionProfile, selectInjectors } from './selector'

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    opts: { skillId: 'demo', ...overrides },
    agentRun: { meta: { depth: 0 } },
    ...overrides,
  }
}

describe('injector selector', () => {
  it('resolves default toolLoop profile for non-coding skills', () => {
    const profile = resolveInjectionProfile(makeCtx() as never, 'toolLoop')
    expect(profile.key).toBe('toolLoop.default')
    expect(profile.planModeUsesPrepareStep).toBe(false)
    expect(selectInjectors(profile).map((i) => i.id)).toContain(
      'run-script-preference',
    )
    expect(selectInjectors(profile).map((i) => i.id)).toContain('plan-mode')
  })

  it('resolves coding root profile with prepareStep', () => {
    const profile = resolveInjectionProfile(
      makeCtx({ opts: { skillId: 'coding' } }) as never,
      'toolLoop',
    )
    expect(profile.key).toBe('toolLoop.coding.root')
    expect(profile.planModeUsesPrepareStep).toBe(true)
    expect(selectInjectors(profile).map((i) => i.id)).toContain('plan-mode')
  })

  it('resolves coding child profile without plan-mode', () => {
    const profile = resolveInjectionProfile(
      makeCtx({
        opts: { skillId: 'coding' },
        agentRun: { meta: { depth: 1 } },
      }) as never,
      'toolLoop',
    )
    expect(profile.key).toBe('toolLoop.coding.child')
    expect(selectInjectors(profile).map((i) => i.id)).not.toContain('plan-mode')
  })

  it('resolves todoExecution profile', () => {
    const profile = resolveInjectionProfile(makeCtx() as never, 'todoExecution')
    expect(profile.key).toBe('todoExecution')
    const ids = selectInjectors(profile).map((i) => i.id)
    expect(ids).toContain('executor-base')
    expect(ids).toContain('step-goal')
    expect(ids).not.toContain('base-tool-loop')
  })
})
