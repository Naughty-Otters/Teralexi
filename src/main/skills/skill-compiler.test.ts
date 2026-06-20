import { beforeEach, describe, expect, it, vi } from 'vitest'

const upsertSkillCompilation = vi.fn()
const getSkillCompilation = vi.fn()

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getSkillCompilation,
    upsertSkillCompilation,
  }),
}))

vi.mock('@main/agent/utils', () => ({
  loadAgentRunCredentials: () => ({}),
}))

vi.mock('@main/agent/providers/adapters', () => ({
  createModelForProvider: () => 'mock-model',
}))

const streamTextMock = vi.fn()

vi.mock('@openfde-ai', () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
}))

import { compileSkill, computeSkillSourceFingerprint, type SkillCompileGatheredInput } from './skill-compiler'
import { SKILL_COMPILED_VERSION } from './skill-compiled-schema'

function sampleGathered(fingerprint: string): SkillCompileGatheredInput {
  return {
    skillId: 'demo',
    source: 'bundled',
    folder: '/skills/demo',
    fingerprint,
    propertiesRaw: 'name: Demo',
    skillMd: '# Demo',
    attachmentsText: '',
    model: 'llama',
    provider: 'ollama',
  }
}

function validCompileJson(fingerprint: string): string {
  return JSON.stringify({
    version: SKILL_COMPILED_VERSION,
    skillId: 'demo',
    sourceFingerprint: fingerprint,
    thinking: { instructions: 't' },
    instructions: { instructions: 'compiled instructions' },
    validation: { rules: ['done'] },
  })
}

describe('skill-compiler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSkillCompilation.mockReturnValue(null)
    streamTextMock.mockReset()
  })

  it('compileSkill persists validated artifact', async () => {
    const fingerprint = 'test-fingerprint'
    const artifact = await compileSkill('demo', {
      force: true,
      gather: () => sampleGathered(fingerprint),
      runLlm: async () => validCompileJson(fingerprint),
    })
    expect(artifact?.instructions.instructions).toBe('compiled instructions')
    expect(upsertSkillCompilation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ready', skillId: 'demo' }),
    )
  })

  it('retries once on invalid JSON', async () => {
    const fingerprint = 'fp'
    let calls = 0
    const artifact = await compileSkill('demo', {
      force: true,
      gather: () => sampleGathered(fingerprint),
      runLlm: async () => {
        calls += 1
        return calls === 1 ? 'not json' : validCompileJson(fingerprint)
      },
    })
    expect(artifact).not.toBeNull()
    expect(calls).toBe(2)
  })

  it('marks compilation failed when LLM throws', async () => {
    const artifact = await compileSkill('demo', {
      force: true,
      gather: () => sampleGathered('fail-fp'),
      runLlm: async () => {
        throw new Error('provider unavailable')
      },
    })

    expect(artifact).toBeNull()
    expect(upsertSkillCompilation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'provider unavailable',
      }),
    )
  })

  it('computeSkillSourceFingerprint returns empty string for unknown skill', () => {
    expect(computeSkillSourceFingerprint('__missing_skill__')).toBe('')
  })
})
