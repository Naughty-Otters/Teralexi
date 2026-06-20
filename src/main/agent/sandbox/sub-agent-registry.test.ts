import { describe, expect, it, vi, beforeEach } from 'vitest'
import { join } from 'node:path'

vi.mock('@config/openfde-home', () => ({
  getopenfdeSandboxDir: vi.fn(() => '/mock/sandbox'),
}))

vi.mock('./sandbox-impl', () => ({
  Sandbox: vi.fn().mockImplementation(function SandboxMock(this: {
    layout: { root: string }
    init: () => Promise<void>
    copySkillAssets: () => Promise<void>
    cleanup: () => Promise<void>
  }, opts: { root?: string }) {
    this.layout = { root: opts.root ?? '/mock/sandbox/default' }
    this.init = vi.fn(async () => {})
    this.copySkillAssets = vi.fn(async () => {})
    this.cleanup = vi.fn(async () => {})
  }),
}))

import {
  clearSubAgentSandboxRegistryForTests,
  resolveSubAgentSandboxRoot,
  sanitizeAgentIdForSandboxPath,
  getOrCreateSandboxForSubAgentRun,
  listSubAgentSandboxRootsForConversation,
} from './sub-agent-registry'

describe('sub-agent-registry', () => {
  beforeEach(() => {
    clearSubAgentSandboxRegistryForTests()
  })

  it('sanitizes agent ids for filesystem paths', () => {
    expect(sanitizeAgentIdForSandboxPath('skill:demo')).toBe('skill_demo')
  })

  it('resolves sandbox root under sub-agents with prefixed run id', () => {
    expect(
      resolveSubAgentSandboxRoot(
        'skill:demo',
        'sub-agent-demo-a1b2c3d4',
      ),
    ).toBe(join('/mock/sandbox', 'sub-agents', 'sub-agent-demo-a1b2c3d4'))
  })

  it('tracks conversation sandbox roots for cleanup', async () => {
    await getOrCreateSandboxForSubAgentRun({
      agentId: 'skill:demo',
      runId: 'sub-agent-demo-run-a',
      conversationId: 'conv-1',
      parentRunId: 'parent-1',
    })
    expect(listSubAgentSandboxRootsForConversation('conv-1')).toHaveLength(1)
  })
})
