import { describe, expect, it } from 'vitest'
import { createMigrationTestDatabase } from './migration-test-db'
import { runMigrations } from './migrations'
import { ConversationSettingsRepository } from './conversation-settings-repository'

function seedConversation(
  db: ReturnType<typeof createMigrationTestDatabase>,
  id: string,
): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO conversations (id, agent_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, 'agent-1', 'Test', now, now)
}

describe('ConversationSettingsRepository', () => {
  it('returns null when no settings row exists', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    seedConversation(db, 'conv-1')
    const repo = new ConversationSettingsRepository(db)
    expect(repo.get('conv-1')).toBeNull()
  })

  it('sets and clears workspace path', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    seedConversation(db, 'conv-2')
    const repo = new ConversationSettingsRepository(db)

    const saved = repo.setWorkspacePath('conv-2', '/tmp/workspace')
    expect(saved.workspacePath).toBe('/tmp/workspace')

    expect(repo.get('conv-2')?.workspacePath).toBe('/tmp/workspace')

    repo.clear('conv-2')
    expect(repo.get('conv-2')?.workspacePath).toBeNull()
  })

  it('persists coding mode per conversation', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    seedConversation(db, 'conv-3')
    const repo = new ConversationSettingsRepository(db)

    const saved = repo.setCodingMode('conv-3', 'explore')
    expect(saved.codingMode).toBe('explore')
    expect(repo.getCodingMode('conv-3')).toBe('explore')

    repo.setCodingMode('conv-3', 'yolo')
    expect(repo.get('conv-3')?.codingMode).toBe('yolo')
  })

  it('persists agent plan mode state', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    seedConversation(db, 'conv-plan')
    const repo = new ConversationSettingsRepository(db)

    const saved = repo.setPlanModeState('conv-plan', {
      status: 'planning',
      planSlug: 'my-plan',
    })
    expect(saved.planModeState.status).toBe('planning')
    expect(saved.planModeState.planSlug).toBe('my-plan')
    expect(repo.getPlanModeState('conv-plan').status).toBe('planning')
  })

  it('persists per-conversation pre/post hooks', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    seedConversation(db, 'conv-hooks')
    const repo = new ConversationSettingsRepository(db)

    const saved = repo.setHooks('conv-hooks', {
      hooks: [
        {
          id: 'pre-1',
          event: 'preHook',
          command: 'node',
          args: ['pre.js'],
        },
        {
          id: 'post-1',
          event: 'postHook',
          command: '/bin/true',
          enabled: false,
        },
      ],
    })
    expect(saved.hooks.hooks).toHaveLength(2)
    expect(repo.getHooks('conv-hooks').hooks[0]).toMatchObject({
      id: 'pre-1',
      event: 'preHook',
      command: 'node',
    })
    expect(repo.get('conv-hooks')?.hooks.hooks[1]?.enabled).toBe(false)
  })

  it('reads legacy plan mode as explore', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    seedConversation(db, 'conv-4')
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO conversation_settings (conversation_id, workspace_path, session_approved_tools_json, coding_mode_json, plan_mode_json, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?)`,
    ).run('conv-4', '[]', '"plan"', '{"planMode":false}', now)
    const repo = new ConversationSettingsRepository(db)
    expect(repo.getCodingMode('conv-4')).toBe('explore')
  })
})
