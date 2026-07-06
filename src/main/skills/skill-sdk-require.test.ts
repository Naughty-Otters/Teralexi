import { describe, expect, it, vi } from 'vitest'

vi.mock('@main/config/app-paths', () => ({
  isPackagedApp: () => true,
}))

vi.mock('./skill-sdk-module', () => ({
  getSkillSdkModuleExports: () => ({ readSkillAttachment: vi.fn() }),
}))

import { createSkillModuleRequire } from './skill-sdk-require'

describe('createSkillModuleRequire', () => {
  it('resolves @teralexi/skill-sdk from the main-process runtime', () => {
    const req = createSkillModuleRequire(__filename)
    const sdk = req('@teralexi/skill-sdk') as { readSkillAttachment: unknown }
    expect(typeof sdk.readSkillAttachment).toBe('function')
  })

  it('blocks @main imports when packaged', () => {
    const req = createSkillModuleRequire(__filename)
    expect(() => req('@main/skills/types')).toThrow(
      /Use @teralexi\/skill-sdk/,
    )
  })
})
