import { describe, expect, it } from 'vitest'
import { createMockRegistry } from '@main/workflows/mock-registry'

describe('MockRegistry', () => {
  it('returns tool fixture in test mode', async () => {
    const registry = createMockRegistry(
      {
        tools: [{ tool: 'github_issue_create', fixture: { id: 'mock-1' } }],
      },
      'test',
    )

    const result = await registry.wrapToolExecute(
      'github_issue_create',
      {},
      async () => ({ id: 'real' }),
    )
    expect(result).toEqual({ id: 'mock-1' })
    expect(registry.hits).toHaveLength(1)
  })

  it('allows read-only tools without mocks', async () => {
    const registry = createMockRegistry(undefined, 'test')
    const result = await registry.wrapToolExecute(
      'read_file',
      { path: 'a.txt' },
      async () => ({ content: 'ok' }),
    )
    expect(result).toEqual({ content: 'ok' })
  })

  it('does not mock in production mode', async () => {
    const registry = createMockRegistry(
      {
        tools: [{ tool: 'write_file', fixture: { ok: true } }],
      },
      'production',
    )
    const result = await registry.wrapToolExecute(
      'write_file',
      {},
      async () => ({ ok: false }),
    )
    expect(result).toEqual({ ok: false })
    expect(registry.hits).toHaveLength(0)
  })
})
