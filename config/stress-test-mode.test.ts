import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_STRESS_DURATION_MS,
  isStressTestEnabled,
  parseStressDurationMs,
  resetStressTestArgvCacheForTests,
  resolveStressDurationMs,
} from './stress-test-mode'

describe('stress-test-mode', () => {
  const prevEnv = process.env.TERALEXI_STRESS_TEST
  const prevDur = process.env.TERALEXI_STRESS_DURATION

  afterEach(() => {
    resetStressTestArgvCacheForTests()
    if (prevEnv === undefined) delete process.env.TERALEXI_STRESS_TEST
    else process.env.TERALEXI_STRESS_TEST = prevEnv
    if (prevDur === undefined) delete process.env.TERALEXI_STRESS_DURATION
    else process.env.TERALEXI_STRESS_DURATION = prevDur
  })

  it('parses duration units', () => {
    expect(parseStressDurationMs('30m')).toBe(30 * 60_000)
    expect(parseStressDurationMs('2h')).toBe(2 * 3_600_000)
    expect(parseStressDurationMs('10h')).toBe(10 * 3_600_000)
    expect(parseStressDurationMs('90s')).toBe(90_000)
    expect(parseStressDurationMs('1500')).toBe(1500)
    expect(parseStressDurationMs('nope')).toBeNull()
  })

  it('gates on env truthy values', () => {
    delete process.env.TERALEXI_STRESS_TEST
    resetStressTestArgvCacheForTests()
    expect(isStressTestEnabled()).toBe(false)
    process.env.TERALEXI_STRESS_TEST = '1'
    resetStressTestArgvCacheForTests()
    expect(isStressTestEnabled()).toBe(true)
  })

  it('resolves default duration to 10h', () => {
    delete process.env.TERALEXI_STRESS_DURATION
    resetStressTestArgvCacheForTests()
    expect(resolveStressDurationMs()).toBe(DEFAULT_STRESS_DURATION_MS)
    expect(resolveStressDurationMs('2m')).toBe(120_000)
  })
})
