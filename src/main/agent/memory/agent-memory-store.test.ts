import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  loadAllMemoryBlocksForConversation,
  loadPersonaMemorySnapshot,
  loadSessionMemorySnapshot,
  persistAgentMemoryBlock,
  persistSessionMemorySnapshot,
  pruneAgentMemoryBlocks,
} from '@main/agent/memory/agent-memory-store'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  mkdirSync: vi.fn(),
}))

vi.mock('@config/teralexi-home', () => ({
  getAgentMemoryDirs: vi.fn(() => ({
    block: '/mem/block',
    session: '/mem/session',
    persona: '/mem/persona',
  })),
  getGlobalPersonaSnapshotPath: vi.fn(() => '/mem/users/u/persona/profile.json'),
  resolveGlobalPersonaSnapshotPath: vi.fn(() => '/mem/users/u/persona/profile.json'),
  resolveAgentPersonaSnapshotPath: vi.fn(
    (agentId: string) => `/mem/${agentId}/persona/profile.json`,
  ),
  getTeralexiMemoryDir: vi.fn(() => '/mem'),
}))

import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'

describe('agent-memory-store', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset()
    vi.mocked(readFileSync).mockReset()
    vi.mocked(writeFileSync).mockReset()
  })

  it('loadSessionMemorySnapshot returns null when missing', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(loadSessionMemorySnapshot('agent', 'conv')).toBeNull()
  })

  it('loadSessionMemorySnapshot parses JSON file', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        agentId: 'agent',
        conversationId: 'conv',
        summary: 'hi',
      }),
    )
    expect(loadSessionMemorySnapshot('agent', 'conv')).toMatchObject({
      summary: 'hi',
    })
  })

  it('persistSessionMemorySnapshot writes JSON', () => {
    persistSessionMemorySnapshot({
      agentId: 'agent',
      conversationId: 'conv',
      summary: 'saved',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as never)
    expect(writeFileSync).toHaveBeenCalled()
    const payload = String(vi.mocked(writeFileSync).mock.calls[0][1])
    expect(payload).toContain('saved')
  })

  it('loadAllMemoryBlocksForConversation filters by prefix and sorts', () => {
    vi.mocked(readdirSync).mockReturnValue([
      'conv_1.json',
      'conv_2.json',
      'other.json',
    ] as never)
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((path: string) => {
      const id = String(path).includes('conv_2') ? 'conv_2' : 'conv_1'
      return JSON.stringify({
        agentId: 'agent',
        conversationId: 'conv',
        blockId: id,
        recordedAt: id === 'conv_2' ? '2026-02-02' : '2026-01-01',
        messages: [{ role: 'user', content: 'hi' }],
      })
    })

    const blocks = loadAllMemoryBlocksForConversation('agent', 'conv')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].blockId).toBe('conv_1')
    expect(blocks[1].blockId).toBe('conv_2')
  })

  it('loadPersonaMemorySnapshot reads global persona profile', () => {
    vi.mocked(existsSync).mockImplementation((p: string) =>
      String(p).includes('profile.json'),
    )
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ userId: 'u1', traits: ['curious'] }),
    )
    expect(loadPersonaMemorySnapshot('u1')).toMatchObject({
      traits: ['curious'],
    })
  })

  it('persistAgentMemoryBlock writes block json', () => {
    persistAgentMemoryBlock({
      agentId: 'agent',
      conversationId: 'conv',
      blockId: 'conv_b1',
      recordedAt: '2026-01-01',
      messages: [],
    } as never)
    expect(writeFileSync).toHaveBeenCalled()
  })

  it('pruneAgentMemoryBlocks deletes oldest blocks beyond limit', () => {
    vi.mocked(readdirSync).mockReturnValue([
      'b1.json',
      'b2.json',
      'b3.json',
    ] as never)
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((path: string) => {
      const id = String(path).includes('b3')
        ? 'b3'
        : String(path).includes('b2')
          ? 'b2'
          : 'b1'
      const recordedAt =
        id === 'b1' ? '2026-01-01' : id === 'b2' ? '2026-02-02' : '2026-03-03'
      return JSON.stringify({
        agentId: 'agent',
        conversationId: 'conv',
        blockId: id,
        recordedAt,
        messages: [{ role: 'user', content: 'hi' }],
      })
    })

    pruneAgentMemoryBlocks('agent', 2)
    expect(unlinkSync).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(unlinkSync).mock.calls[0][0])).toContain('b1.json')
  })
})
