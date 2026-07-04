import { beforeEach, describe, expect, it, vi } from 'vitest'
import { p } from '@test-paths'

vi.mock('@config/openfde-home', () => ({
  getopenfdeSandboxDir: vi.fn(() => '/mock/sandbox'),
}))

const cleanup = vi.fn()
const copySkillAssets = vi.fn()

vi.mock('./sandbox-impl', () => ({
  Sandbox: class MockSandbox {
    layout: { root: string }
    constructor(opts?: { root?: string }) {
      this.layout = { root: opts?.root ?? '/ephemeral' }
    }
    copySkillAssets = copySkillAssets
    cleanup = cleanup
  },
}))

import { Sandbox } from './sandbox-impl'
import {
  getOrCreateSandboxForConversation,
  peekSandboxRootForConversation,
  releaseConversationSandbox,
  resolveSandboxRootForConversation,
} from './registry'

describe('sandbox registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    copySkillAssets.mockResolvedValue(undefined)
    cleanup.mockResolvedValue(undefined)
  })

  it('creates ephemeral sandbox without conversation id', async () => {
    const sb = await getOrCreateSandboxForConversation(undefined, 'skill-a')
    expect(Sandbox).toBeDefined()
    expect(copySkillAssets).toHaveBeenCalledWith('skill-a')
    expect(sb.layout.root).toBe('/ephemeral')
  })

  it('reuses sandbox for same conversation id', async () => {
    const first = await getOrCreateSandboxForConversation('conv-1', 's1')
    const second = await getOrCreateSandboxForConversation('conv-1', 's2')
    expect(first).toBe(second)
    expect(copySkillAssets).toHaveBeenCalledWith('s2')
  })

  it('resolveSandboxRootForConversation returns stable path before registry entry', () => {
    const stable = resolveSandboxRootForConversation('conv-stable')
    expect(p(stable)).toMatch(/^\/mock\/sandbox\/[a-f0-9]{64}$/)
    expect(peekSandboxRootForConversation('conv-stable')).toBeUndefined()
  })

  it('peekSandboxRootForConversation returns registry root after create', async () => {
    await getOrCreateSandboxForConversation('conv-peek', 'skill')
    const peeked = peekSandboxRootForConversation('conv-peek')
    expect(peeked).toBeTruthy()
    expect(resolveSandboxRootForConversation('conv-peek')).toBe(peeked)
  })

  it('peekSandboxRootForConversation returns undefined for blank id', () => {
    expect(peekSandboxRootForConversation('')).toBeUndefined()
    expect(peekSandboxRootForConversation(undefined)).toBeUndefined()
  })

  it('releaseConversationSandbox is a no-op when sandbox was never created', async () => {
    await releaseConversationSandbox('never-created')
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('releaseConversationSandbox cleans up registry entry', async () => {
    await getOrCreateSandboxForConversation('conv-del', 's')
    await releaseConversationSandbox('conv-del')
    expect(cleanup).toHaveBeenCalled()
    await getOrCreateSandboxForConversation('conv-del')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
