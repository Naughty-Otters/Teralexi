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

  it('persists conversation LLM override', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    seedConversation(db, 'conv-llm')
    const repo = new ConversationSettingsRepository(db)

    const saved = repo.setLlmOverride('conv-llm', {
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: 'high' } },
      },
    })
    expect(saved.llmOverride).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: 'high' } },
      },
    })
    expect(repo.getLlmOverride('conv-llm')?.model).toBe('gemini-2.5-pro')

    // Stored as JSON column on conversation_settings.
    const row = db
      .prepare(
        `SELECT llm_override_json FROM conversation_settings WHERE conversation_id = ?`,
      )
      .get('conv-llm') as { llm_override_json: string }
    expect(JSON.parse(row.llm_override_json)).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      providerOptions: {
        google: { thinkingConfig: { thinkingLevel: 'high' } },
      },
    })

    // Toggle off → null, agent defaults take over at resolve time.
    repo.setLlmOverride('conv-llm', null)
    expect(repo.getLlmOverride('conv-llm')).toBeNull()
    const cleared = db
      .prepare(
        `SELECT llm_override_json FROM conversation_settings WHERE conversation_id = ?`,
      )
      .get('conv-llm') as { llm_override_json: string }
    expect(cleared.llm_override_json).toBe('null')
  })

  it('keeps LLM overrides isolated per conversation thread', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)
    seedConversation(db, 'conv-a')
    seedConversation(db, 'conv-b')
    const repo = new ConversationSettingsRepository(db)

    repo.setWorkspacePath('conv-a', '/tmp/a')
    repo.setLlmOverride('conv-a', {
      provider: 'openai',
      model: 'gpt-4.1',
      providerOptions: { openai: { reasoningEffort: 'high' } },
    })
    repo.setLlmOverride('conv-b', {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      providerOptions: {
        google: { thinkingConfig: { includeThoughts: true } },
      },
    })

    expect(repo.getLlmOverride('conv-a')).toEqual({
      provider: 'openai',
      model: 'gpt-4.1',
      providerOptions: { openai: { reasoningEffort: 'high' } },
    })
    expect(repo.getLlmOverride('conv-b')).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      providerOptions: {
        google: { thinkingConfig: { includeThoughts: true } },
      },
    })

    // Clearing one thread must not affect the other, and preserves sibling settings.
    repo.setLlmOverride('conv-a', null)
    expect(repo.getLlmOverride('conv-a')).toBeNull()
    expect(repo.get('conv-a')?.workspacePath).toBe('/tmp/a')
    expect(repo.getLlmOverride('conv-b')?.model).toBe('gemini-2.5-flash')
  })
})
