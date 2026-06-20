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
})
