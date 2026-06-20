import { describe, expect, it } from 'vitest'
import type {
  GuardRailAction,
  SkillColor,
  SkillProvider,
  SkillToolOs,
} from './types'

describe('skills types (smoke)', () => {
  it('imports type-only exports without runtime errors', () => {
    const color: SkillColor = 'primary'
    const provider: SkillProvider = 'openai'
    const os: SkillToolOs = 'mac'
    const action: GuardRailAction = 'refuse'
    expect([color, provider, os, action]).toBeDefined()
  })
})
