import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { AGENT_PROVIDER_SQL_CHECK } from '@shared/agent/llm-provider-registry'
import { createMigrationTestDatabase } from './migration-test-db'
import { runMigrations } from './migrations'

function columnNames(db: Database.Database, table: string): string[] {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>
  return cols.map((c) => c.name)
}

describe('runMigrations agent_configurations', () => {
  it('drops legacy planning/summary/report prompt columns', () => {
    const db = createMigrationTestDatabase()
    db.exec(`
      CREATE TABLE agent_configurations (
        agent_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL,
        color TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        system_prompt TEXT NOT NULL DEFAULT '',
        planning_prompt TEXT NOT NULL DEFAULT '',
        skills_prompt TEXT NOT NULL DEFAULT '',
        summary_prompt TEXT NOT NULL DEFAULT '',
        report_prompt TEXT NOT NULL DEFAULT '',
        available_set_json TEXT NOT NULL DEFAULT '[]',
        available_set_touched INTEGER NOT NULL DEFAULT 0,
        tool_needs_approval_overrides_json TEXT NOT NULL DEFAULT '{}',
        available_mcp_servers_json TEXT NOT NULL DEFAULT 'null',
        tool_loop_max_iterations INTEGER NOT NULL DEFAULT 40,
        allow_as_sub_agent INTEGER NOT NULL DEFAULT 1,
        allow_sub_agents INTEGER NOT NULL DEFAULT 0,
        sub_agent_ids_json TEXT NOT NULL DEFAULT 'null',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (agent_id, user_id)
      );
    `)
    db.prepare(
      `INSERT INTO agent_configurations (
        agent_id, user_id, name, model, provider, color, enabled,
        planning_prompt, skills_prompt, summary_prompt, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'skill:test',
      'user-1',
      'Test',
      'm',
      'ollama',
      'primary',
      1,
      'Legacy planning',
      '',
      'Legacy summary',
      '2020-01-01',
      '2020-01-01',
    )

    runMigrations(db)

    const cols = columnNames(db, 'agent_configurations')
    expect(cols).toContain('skills_prompt')
    expect(cols).not.toContain('planning_prompt')
    expect(cols).not.toContain('summary_prompt')
    expect(cols).not.toContain('report_prompt')

    const row = db
      .prepare(
        'SELECT skills_prompt FROM agent_configurations WHERE agent_id = ?',
      )
      .get('skill:test') as { skills_prompt: string }

    expect(row.skills_prompt).toBe('Legacy planning')
  })

  it('adds sub-agent delegation columns with defaults on fresh schema', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)

    const cols = columnNames(db, 'agent_configurations')
    expect(cols).toContain('allow_as_sub_agent')
    expect(cols).toContain('allow_sub_agents')
    expect(cols).toContain('sub_agent_ids_json')
    expect(cols).not.toContain('planning_prompt')
  })

  it('fresh schema allows zhipu provider in agent_configurations', () => {
    const db = createMigrationTestDatabase()
    runMigrations(db)

    const row = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_configurations'",
      )
      .get() as { sql: string }

    expect(row.sql).toContain(AGENT_PROVIDER_SQL_CHECK)
    expect(row.sql).toContain("'zhipu'")

    expect(() =>
      db
        .prepare(
          `INSERT INTO agent_configurations (
            agent_id, user_id, name, model, provider, color, enabled,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'glm-agent',
          'user-1',
          'GLM',
          'glm-4.6',
          'zhipu',
          'primary',
          1,
          '2020-01-01',
          '2020-01-01',
        ),
    ).not.toThrow()
  })

  it('enables allow_sub_agents for existing agent rows', () => {
    const db = createMigrationTestDatabase()
    db.exec(`
      CREATE TABLE agent_configurations (
        agent_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL,
        color TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        system_prompt TEXT NOT NULL DEFAULT '',
        skills_prompt TEXT NOT NULL DEFAULT '',
        available_set_json TEXT NOT NULL DEFAULT '[]',
        available_set_touched INTEGER NOT NULL DEFAULT 0,
        tool_needs_approval_overrides_json TEXT NOT NULL DEFAULT '{}',
        available_mcp_servers_json TEXT NOT NULL DEFAULT 'null',
        tool_loop_max_iterations INTEGER NOT NULL DEFAULT 40,
        allow_as_sub_agent INTEGER NOT NULL DEFAULT 1,
        allow_sub_agents INTEGER NOT NULL DEFAULT 0,
        sub_agent_ids_json TEXT NOT NULL DEFAULT 'null',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (agent_id, user_id)
      );
    `)
    db.prepare(
      `INSERT INTO agent_configurations (
        agent_id, user_id, name, model, provider, color, enabled,
        allow_sub_agents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'coding',
      'user-1',
      'Coding',
      'm',
      'ollama',
      'primary',
      1,
      0,
      '2020-01-01',
      '2020-01-01',
    )

    runMigrations(db)

    const row = db
      .prepare('SELECT allow_sub_agents FROM agent_configurations WHERE agent_id = ?')
      .get('coding') as { allow_sub_agents: number }
    expect(row.allow_sub_agents).toBe(1)
  })

  it('enables allow_as_sub_agent for existing agent rows', () => {
    const db = createMigrationTestDatabase()
    db.exec(`
      CREATE TABLE agent_configurations (
        agent_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL,
        color TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        system_prompt TEXT NOT NULL DEFAULT '',
        skills_prompt TEXT NOT NULL DEFAULT '',
        available_set_json TEXT NOT NULL DEFAULT '[]',
        available_set_touched INTEGER NOT NULL DEFAULT 0,
        tool_needs_approval_overrides_json TEXT NOT NULL DEFAULT '{}',
        available_mcp_servers_json TEXT NOT NULL DEFAULT 'null',
        tool_loop_max_iterations INTEGER NOT NULL DEFAULT 40,
        allow_as_sub_agent INTEGER NOT NULL DEFAULT 0,
        allow_sub_agents INTEGER NOT NULL DEFAULT 1,
        sub_agent_ids_json TEXT NOT NULL DEFAULT 'null',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (agent_id, user_id)
      );
    `)
    db.prepare(
      `INSERT INTO agent_configurations (
        agent_id, user_id, name, model, provider, color, enabled,
        allow_as_sub_agent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'skill:documents',
      'user-1',
      'Documents',
      'm',
      'ollama',
      'primary',
      1,
      0,
      '2020-01-01',
      '2020-01-01',
    )

    runMigrations(db)

    const row = db
      .prepare(
        'SELECT allow_as_sub_agent FROM agent_configurations WHERE agent_id = ?',
      )
      .get('skill:documents') as { allow_as_sub_agent: number }
    expect(row.allow_as_sub_agent).toBe(1)
  })
})
