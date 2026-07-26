import { describe, expect, it } from 'vitest'
import {
  STRESS_SKILL_IDS,
  buildAiContinueGeneratorPrompt,
  getAllStressScenarios,
  getStressScenariosForFilter,
} from './index'

describe('stress-test scenarios', () => {
  it('covers every bundled stress skill id', () => {
    const scenarios = getAllStressScenarios()
    expect(scenarios.map((s) => s.skillId).sort()).toEqual(
      [...STRESS_SKILL_IDS].sort(),
    )
    for (const s of scenarios) {
      expect(s.agentId).toBe(`skill:${s.skillId}`)
      expect(s.prompts.length).toBeGreaterThan(0)
      expect(new Set(s.prompts.map((p) => p.id)).size).toBe(s.prompts.length)
    }
  })

  it('filters to a single skill', () => {
    const only = getStressScenariosForFilter(['coding'])
    expect(only).toHaveLength(1)
    expect(only[0]?.skillId).toBe('coding')
    expect(only[0]?.needsWorkspace).toBe(true)
  })

  it('filters to multiple skills in selection order', () => {
    const multi = getStressScenariosForFilter(['website', 'default', 'coding'])
    expect(multi.map((s) => s.skillId)).toEqual([
      'website',
      'default',
      'coding',
    ])
  })

  it('returns empty for an empty selection', () => {
    expect(getStressScenariosForFilter([])).toEqual([])
  })

  it('marks workspace-needing skills', () => {
    const map = Object.fromEntries(
      getAllStressScenarios().map((s) => [s.skillId, s.needsWorkspace]),
    )
    expect(map.default).toBe(false)
    expect(map.coding).toBe(true)
    expect(map.website).toBe(true)
    expect(map.documents).toBe(false)
  })

  it('builds an AI-continue generator prompt', () => {
    const text = buildAiContinueGeneratorPrompt('research')
    expect(text).toContain('research')
    expect(text.toLowerCase()).toContain('only')
  })

  it('tags google prompts that require auth', () => {
    const gws = getStressScenariosForFilter(['google-workspace'])[0]!
    expect(gws.prompts.some((p) => p.requiresAuth)).toBe(true)
    expect(gws.prompts.some((p) => p.id === 'gws-01' && !p.requiresAuth)).toBe(
      true,
    )
  })
})
