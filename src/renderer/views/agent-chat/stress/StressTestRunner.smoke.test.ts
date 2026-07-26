/**
 * Prompt-selection smoke helpers exercised without Electron/LLM.
 * Mirrors StressTestRunner.resolveNextPrompt cycle/hybrid transitions.
 */
import { describe, expect, it } from 'vitest'
import {
  buildAiContinueGeneratorPrompt,
  getStressScenariosForFilter,
} from '@shared/stress-test'
import type { StressInputMode, StressPrompt } from '@shared/stress-test/types'

function resolveNext(
  prompts: StressPrompt[],
  promptIndex: number,
  scriptedExhausted: boolean,
  mode: StressInputMode,
  skillId: 'default' | 'coding',
  googleAuth: boolean,
): {
  nextIndex: number
  exhausted: boolean
  source: string
  text: string
} | null {
  const filtered = prompts.filter((p) => {
    if (skillId !== 'default' && (p as { requiresAuth?: boolean }).requiresAuth && !googleAuth) {
      return false
    }
    return true
  })
  if (!filtered.length) return null
  const useAi =
    mode === 'ai-continue' || (mode === 'hybrid' && scriptedExhausted)
  if (useAi) {
    return {
      nextIndex: promptIndex,
      exhausted: true,
      source: 'ai-generator',
      text: buildAiContinueGeneratorPrompt(skillId),
    }
  }
  if (promptIndex >= filtered.length) {
    if (mode === 'cycle') {
      return {
        nextIndex: 1,
        exhausted: false,
        source: 'scripted',
        text: filtered[0]!.text,
      }
    }
    if (mode === 'hybrid') {
      return {
        nextIndex: promptIndex,
        exhausted: true,
        source: 'ai-generator',
        text: buildAiContinueGeneratorPrompt(skillId),
      }
    }
    return null
  }
  const prompt = filtered[promptIndex]!
  const nextIndex = promptIndex + 1
  return {
    nextIndex,
    exhausted: mode === 'hybrid' && nextIndex >= filtered.length,
    source: 'scripted',
    text: prompt.text,
  }
}

describe('stress runner prompt selection (smoke)', () => {
  it('cycles default and coding scripted lists for a 2-minute style dry pass', () => {
    const defaultScenario = getStressScenariosForFilter(['default'])[0]!
    const codingScenario = getStressScenariosForFilter(['coding'])[0]!

    let dIdx = 0
    let dExhausted = false
    let cIdx = 0
    let cExhausted = false
    const texts: string[] = []

    // Simulate ~one full pass over both skills (smoke without LLM).
    for (let i = 0; i < defaultScenario.prompts.length + codingScenario.prompts.length; i++) {
      const useDefault = i % 2 === 0
      if (useDefault) {
        const r = resolveNext(
          defaultScenario.prompts,
          dIdx,
          dExhausted,
          'hybrid',
          'default',
          true,
        )
        expect(r).not.toBeNull()
        texts.push(r!.text)
        dIdx = r!.nextIndex
        dExhausted = r!.exhausted
      } else {
        const r = resolveNext(
          codingScenario.prompts,
          cIdx,
          cExhausted,
          'hybrid',
          'coding',
          true,
        )
        expect(r).not.toBeNull()
        texts.push(r!.text)
        cIdx = r!.nextIndex
        cExhausted = r!.exhausted
      }
    }

    expect(texts.length).toBe(
      defaultScenario.prompts.length + codingScenario.prompts.length,
    )
    expect(texts[0]).toContain('local-first')
    expect(texts.some((t) => t.includes('stress workspace'))).toBe(true)
  })

  it('switches to AI generator after hybrid script exhaustion', () => {
    const scenario = getStressScenariosForFilter(['default'])[0]!
    let idx = scenario.prompts.length
    const r = resolveNext(scenario.prompts, idx, false, 'hybrid', 'default', true)
    expect(r?.source).toBe('ai-generator')
    expect(r?.text).toContain('default')
  })
})
