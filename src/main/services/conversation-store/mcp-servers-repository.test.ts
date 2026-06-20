import { describe, expect, it } from 'vitest'
import { runMigrations } from './migrations'
import { createMigrationTestDatabase } from './migration-test-db'
import { McpServersRepository } from './mcp-servers-repository'

describe('McpServersRepository', () => {
  it('seeds official reference servers once per user', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new McpServersRepository(db)

    repo.ensureReferenceServers('default', '/tmp/workspace')
    const first = repo.list('default')
    expect(first.map((server) => server.name)).toEqual([
      'Everything',
      'Fetch',
      'Filesystem',
      'Memory',
      'Time',
      'Sequential Thinking',
    ])

    const filesystem = first.find((server) => server.id === 'ref-mcp-filesystem')
    expect(filesystem?.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
    ])
    expect(first.every((server) => !server.enabled)).toBe(true)

    repo.ensureReferenceServers('default', '/other/workspace')
    expect(repo.list('default')).toHaveLength(6)
  })

  it('rejects deleting built-in reference servers', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new McpServersRepository(db)

    repo.ensureReferenceServers('default', '/tmp/workspace')
    expect(() => repo.delete('default', 'ref-mcp-filesystem')).toThrow(
      'Cannot delete a built-in MCP server.',
    )
    expect(repo.list('default')).toHaveLength(6)
  })
})
