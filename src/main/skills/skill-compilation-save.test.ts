import { beforeEach, describe, expect, it, vi } from 'vitest'

const upsertSkillCompilation = vi.fn()
const getSkillCompilation = vi.fn()

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getSkillCompilation,
    upsertSkillCompilation,
  }),
}))

vi.mock('./skill-path', () => ({
  resolveSkillCompilationSource: () => 'bundled',
}))

vi.mock('./skill-compiler', () => ({
  computeSkillSourceFingerprint: () => 'fp-test',
}))

import { saveSkillCompilation } from './skill-compilation-save'
import { SKILL_COMPILED_VERSION } from './skill-compiled-schema'

const validArtifact = {
  version: SKILL_COMPILED_VERSION,
  skillId: 'demo',
  sourceFingerprint: 'fp-test',
  thinking: { instructions: 'think' },
  instructions: { instructions: 'run' },
  validation: { rules: ['done'] },
}

describe('saveSkillCompilation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates and persists edited artifact', () => {
    const result = saveSkillCompilation('demo', validArtifact)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.compiled.instructions.instructions).toBe('run')
    expect(upsertSkillCompilation).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'demo',
        status: 'ready',
        sourceFingerprint: 'fp-test',
      }),
    )
  })

  it('returns error on invalid payload', () => {
    const result = saveSkillCompilation('demo', null)
    expect(result.ok).toBe(false)
    expect(upsertSkillCompilation).not.toHaveBeenCalled()
  })
})
