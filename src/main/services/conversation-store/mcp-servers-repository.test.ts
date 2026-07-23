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
    expect(first.map((server) => server.name).sort()).toEqual(
      [
        'Everything',
        'Fetch',
        'Filesystem',
        'Memory',
        'Playwright Browser',
        'Sequential Thinking',
        'Time',
      ].sort(),
    )

    const filesystem = first.find((server) => server.id === 'ref-mcp-filesystem')
    expect(filesystem?.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
    ])
    expect(filesystem?.enabled).toBe(false)

    const playwright = first.find((server) => server.id === 'ref-mcp-playwright')
    expect(playwright?.enabled).toBe(true)
    expect(playwright?.command).toBe('node')
    expect(playwright?.args).toEqual(['@playwright/mcp'])

    repo.ensureReferenceServers('default', '/other/workspace')
    expect(repo.list('default')).toHaveLength(7)
  })

  it('enables Playwright Browser for existing users on migration', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new McpServersRepository(db)

    repo.create({
      id: 'ref-mcp-playwright',
      userId: 'default',
      name: 'Playwright Browser',
      transportType: 'stdio',
      url: '',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: {},
      headers: {},
      enabled: false,
    })

    repo.ensureReferenceServers('default', '/tmp/workspace')
    const playwright = repo.get('default', 'ref-mcp-playwright')
    expect(playwright?.enabled).toBe(true)
    expect(playwright?.command).toBe('node')
    expect(playwright?.args).toEqual(['@playwright/mcp'])
  })

  it('re-enables Playwright Browser when launch seed already matches', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new McpServersRepository(db)

    repo.create({
      id: 'ref-mcp-playwright',
      userId: 'default',
      name: 'Playwright Browser',
      transportType: 'stdio',
      url: '',
      command: 'node',
      args: ['@playwright/mcp'],
      env: {},
      headers: {},
      enabled: false,
    })

    repo.ensureReferenceServers('default', '/tmp/workspace')
    expect(repo.get('default', 'ref-mcp-playwright')?.enabled).toBe(true)
  })

  it('rejects deleting built-in reference servers', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const repo = new McpServersRepository(db)

    repo.ensureReferenceServers('default', '/tmp/workspace')
    expect(() => repo.delete('default', 'ref-mcp-filesystem')).toThrow(
      'Cannot delete a built-in MCP server.',
    )
    expect(repo.list('default')).toHaveLength(7)
  })
})
