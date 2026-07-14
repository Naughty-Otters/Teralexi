import { describe, expect, it } from 'vitest'
import { createMigrationTestDatabase } from './migration-test-db'
import { runMigrations } from './migrations'
import { ConversationsRepository } from './conversations-repository'

describe('ConversationsRepository', () => {
  it('updates agent_id for an existing conversation', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('conv-1', 'agent-a', 'Test', now, now)

    const repo = new ConversationsRepository(db)
    repo.updateAgentId('conv-1', 'agent-b')

    const row = repo.get('conv-1')
    expect(row?.agentId).toBe('agent-b')
    expect(row?.title).toBe('Test')
  })

  it('joins workspace_path when listing conversations', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('conv-ws', 'agent-a', 'With workspace', now, now)
    db.prepare(
      `INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('conv-bare', 'agent-a', 'No workspace', now, now)
    db.prepare(
      `INSERT INTO conversation_settings (conversation_id, workspace_path, updated_at)
       VALUES (?, ?, ?)`,
    ).run('conv-ws', '/Users/me/site', now)

    const repo = new ConversationsRepository(db)
    const list = repo.list('agent-a')
    expect(list.find((c) => c.id === 'conv-ws')?.workspacePath).toBe(
      '/Users/me/site',
    )
    expect(list.find((c) => c.id === 'conv-bare')?.workspacePath).toBeNull()
  })
})
