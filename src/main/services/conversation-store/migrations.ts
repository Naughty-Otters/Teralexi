import type Database from 'better-sqlite3'
import { AGENT_PROVIDER_SQL_CHECK } from '@shared/agent/llm-provider-registry'

const AGENT_PROVIDER_CHECK = AGENT_PROVIDER_SQL_CHECK

/** Apply all schema migrations to the database. Idempotent; safe to run on every startup. */
export function runMigrations(db: Database.Database): void {
  createBaseSchema(db)
  migrateMessagesConversationId(db)
  migrateAgentConfigurationsColumns(db)
  migrateAgentSummaryPromptColumn(db)
  migrateDropLegacyAgentPromptColumns(db)
  migrateAgentProviderDeepSeek(db)
  migrateAgentProviderLlamaCpp(db)
  migrateSchedulersSchema(db)
  migrateConversationSandboxRuns(db)
  migrateTokenUsage(db)
  migrateSkillCompilations(db)
  migrateToolResultsAndFts(db)
  migrateThreadTags(db)
  migrateConversationSettings(db)
  migrateCodingModePlanToExplore(db)
  migrateConversationPlanModeState(db)
  migrateParentMessageId(db)
  migrateEnableSubAgentDelegationDefault(db)
  migrateEnableAllowAsSubAgentDefault(db)
  migrateAgentProviderExtendedLlm(db)
  migrateAgentProviderZhipu(db)
  migrateAgentStageLlmColumns(db)
  migrateWorkflowsSchema(db)
  migrateSchedulersRunWorkflow(db)
  migrateMessageAttachments(db)
}

function migrateMessageAttachments(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_attachments (
      id              TEXT PRIMARY KEY,
      message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL,
      original_name   TEXT NOT NULL,
      mime_type       TEXT,
      size_bytes      INTEGER NOT NULL,
      sandbox_path    TEXT NOT NULL,
      created_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_message_attachments_message
      ON message_attachments (message_id);
    CREATE INDEX IF NOT EXISTS idx_message_attachments_conversation
      ON message_attachments (conversation_id, created_at);
  `)
}

function migrateAgentStageLlmColumns(db: Database.Database): void {
  if (!tableHasColumn(db, 'agent_configurations', 'llm_routing_mode')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN llm_routing_mode TEXT NOT NULL DEFAULT 'unified';`,
    )
  }
  if (!tableHasColumn(db, 'agent_configurations', 'stage_llm_json')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN stage_llm_json TEXT NOT NULL DEFAULT '{}';`,
    )
  }
}

function migrateSkillCompilations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_compilations (
      skill_id            TEXT NOT NULL,
      source              TEXT NOT NULL CHECK (source IN ('bundled', 'user')),
      source_fingerprint  TEXT NOT NULL DEFAULT '',
      status              TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
      compiled_json       TEXT NOT NULL DEFAULT '',
      error_message       TEXT,
      compiled_at         TEXT,
      updated_at          TEXT NOT NULL,
      PRIMARY KEY (skill_id, source)
    );
    CREATE INDEX IF NOT EXISTS idx_skill_compilations_skill_id
      ON skill_compilations (skill_id, updated_at);
  `)
}

function createBaseSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      title       TEXT NOT NULL DEFAULT 'New Conversation',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_agent_id
      ON conversations (agent_id, updated_at);

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT    PRIMARY KEY,
      conversation_id TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      agent_id        TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
      content         TEXT    NOT NULL,
      created_at      TEXT    NOT NULL,
      has_error       INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages (conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS user_properties (
      user_id         TEXT NOT NULL,
      property_key    TEXT NOT NULL,
      property_value  TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      PRIMARY KEY (user_id, property_key)
    );
    CREATE INDEX IF NOT EXISTS idx_user_properties_user_id
      ON user_properties (user_id, updated_at);

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      name            TEXT NOT NULL,
      transport_type  TEXT NOT NULL CHECK (transport_type IN ('http', 'sse', 'stdio')),
      url             TEXT NOT NULL DEFAULT '',
      command         TEXT NOT NULL DEFAULT '',
      args_json       TEXT NOT NULL DEFAULT '[]',
      env_json        TEXT NOT NULL DEFAULT '{}',
      headers_json    TEXT NOT NULL DEFAULT '{}',
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_user_id
      ON mcp_servers (user_id, updated_at);

    CREATE TABLE IF NOT EXISTS agent_configurations (
      agent_id         TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      name             TEXT NOT NULL,
      description      TEXT NOT NULL DEFAULT '',
      model            TEXT NOT NULL DEFAULT '',
      provider         TEXT NOT NULL CHECK (provider IN ${AGENT_PROVIDER_CHECK}),
      color            TEXT NOT NULL CHECK (color IN ('primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral')),
      enabled          INTEGER NOT NULL DEFAULT 1,
      system_prompt    TEXT NOT NULL DEFAULT '',
      skills_prompt    TEXT NOT NULL DEFAULT '',
      available_set_json TEXT NOT NULL DEFAULT '[]',
      available_set_touched INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      PRIMARY KEY (agent_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_configurations_user_id
      ON agent_configurations (user_id, updated_at);

    CREATE TABLE IF NOT EXISTS schedulers (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL,
      name             TEXT NOT NULL,
      enabled          INTEGER NOT NULL DEFAULT 1,
      schedule_type    TEXT NOT NULL CHECK (schedule_type IN ('interval', 'cron')),
      interval_ms      INTEGER,
      cron_expression  TEXT,
      timezone         TEXT,
      action_type      TEXT NOT NULL CHECK (action_type IN ('send-channel-message', 'run-agent')),
      channel_id       TEXT NOT NULL DEFAULT '',
      target           TEXT NOT NULL DEFAULT '',
      message          TEXT NOT NULL DEFAULT '',
      agent_id         TEXT NOT NULL DEFAULT '',
      conversation_id  TEXT NOT NULL DEFAULT '',
      prompt           TEXT NOT NULL DEFAULT '',
      last_run_at      TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedulers_user_id
      ON schedulers (user_id, updated_at);
  `)
}

function tableHasColumn(
  db: Database.Database,
  table: string,
  column: string,
): boolean {
  const cols = db.pragma(`table_info(${table})`)
  if (!Array.isArray(cols)) return false
  return (cols as Array<{ name: string }>).some((c) => c.name === column)
}

function migrateMessagesConversationId(db: Database.Database): void {
  if (!tableHasColumn(db, 'messages', 'conversation_id')) {
    db.exec(
      `ALTER TABLE messages ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';`,
    )
  }
}

function migrateAgentConfigurationsColumns(db: Database.Database): void {
  if (!tableHasColumn(db, 'agent_configurations', 'available_set_json')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN available_set_json TEXT NOT NULL DEFAULT '[]';`,
    )
  }
  if (!tableHasColumn(db, 'agent_configurations', 'available_set_touched')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN available_set_touched INTEGER NOT NULL DEFAULT 0;`,
    )
  }
  if (!tableHasColumn(db, 'agent_configurations', 'available_mcp_servers_json')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN available_mcp_servers_json TEXT NOT NULL DEFAULT 'null';`,
    )
  }
  if (
    !tableHasColumn(
      db,
      'agent_configurations',
      'tool_needs_approval_overrides_json',
    )
  ) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN tool_needs_approval_overrides_json TEXT NOT NULL DEFAULT '{}';`,
    )
  }
  if (!tableHasColumn(db, 'agent_configurations', 'tool_loop_max_iterations')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN tool_loop_max_iterations INTEGER NOT NULL DEFAULT 40;`,
    )
  }
  if (!tableHasColumn(db, 'agent_configurations', 'todo_max_retries')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN todo_max_retries INTEGER NOT NULL DEFAULT 3;`,
    )
  }
  if (!tableHasColumn(db, 'agent_configurations', 'allow_as_sub_agent')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN allow_as_sub_agent INTEGER NOT NULL DEFAULT 1;`,
    )
  }
  if (!tableHasColumn(db, 'agent_configurations', 'allow_sub_agents')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN allow_sub_agents INTEGER NOT NULL DEFAULT 1;`,
    )
  }
  if (!tableHasColumn(db, 'agent_configurations', 'sub_agent_ids_json')) {
    db.exec(
      `ALTER TABLE agent_configurations ADD COLUMN sub_agent_ids_json TEXT NOT NULL DEFAULT 'null';`,
    )
  }

  // Backfill touched flag for existing rows where a non-empty tool set was saved.
  db.exec(`
    UPDATE agent_configurations
    SET available_set_touched = 1
    WHERE available_set_touched = 0
      AND available_set_json IS NOT NULL
      AND available_set_json != '[]';
  `)
}

function rebuildAgentConfigurationsProviderCheck(
  db: Database.Database,
  legacySuffix: string,
): void {
  const table = 'agent_configurations'
  const legacy = `${table}_${legacySuffix}`

  db.exec(`
    BEGIN;
    ALTER TABLE ${table} RENAME TO ${legacy};
    ${agentConfigurationsTableDdl(table)}
    INSERT INTO ${table} (
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      skills_prompt,
      available_set_json,
      available_set_touched,
      tool_needs_approval_overrides_json,
      available_mcp_servers_json,
      tool_loop_max_iterations,
      todo_max_retries,
      allow_as_sub_agent,
      allow_sub_agents,
      sub_agent_ids_json,
      created_at,
      updated_at
    )
    SELECT
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      skills_prompt,
      available_set_json,
      available_set_touched,
      tool_needs_approval_overrides_json,
      available_mcp_servers_json,
      tool_loop_max_iterations,
      COALESCE(todo_max_retries, 3),
      COALESCE(allow_as_sub_agent, 1),
      COALESCE(allow_sub_agents, 1),
      COALESCE(sub_agent_ids_json, 'null'),
      created_at,
      updated_at
    FROM ${legacy};
    DROP TABLE ${legacy};
    CREATE INDEX IF NOT EXISTS idx_agent_configurations_user_id
      ON ${table} (user_id, updated_at);
    COMMIT;
  `)
}

function agentConfigurationsProviderCheckSql(
  db: Database.Database,
): string | undefined {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_configurations'",
    )
    .get() as { sql?: string } | undefined
  return row?.sql
}

function migrateAgentProviderDeepSeek(db: Database.Database): void {
  const sql = agentConfigurationsProviderCheckSql(db)
  if (!sql || sql.includes("'deepseek'")) return
  rebuildAgentConfigurationsProviderCheck(db, 'provider_legacy_deepseek')
}

function migrateAgentProviderExtendedLlm(db: Database.Database): void {
  const sql = agentConfigurationsProviderCheckSql(db)
  if (!sql || sql.includes("'moonshot'")) return
  rebuildAgentConfigurationsProviderCheck(db, 'provider_legacy_extended_llm')
}

function migrateAgentProviderLlamaCpp(db: Database.Database): void {
  const sql = agentConfigurationsProviderCheckSql(db)
  if (!sql || sql.includes("'llamacpp'")) return
  rebuildAgentConfigurationsProviderCheck(db, 'provider_legacy_llamacpp')
}

function migrateAgentProviderZhipu(db: Database.Database): void {
  const sql = agentConfigurationsProviderCheckSql(db)
  if (!sql || sql.includes("'zhipu'")) return
  rebuildAgentConfigurationsProviderCheck(db, 'provider_legacy_zhipu')
}

/** Legacy DDL retained for intermediate migrations only. */
function legacyAgentConfigurationsTableDdl(tableName = 'agent_configurations'): string {
  return `CREATE TABLE ${tableName} (
      agent_id         TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      name             TEXT NOT NULL,
      description      TEXT NOT NULL DEFAULT '',
      model            TEXT NOT NULL DEFAULT '',
      provider         TEXT NOT NULL CHECK (provider IN ${AGENT_PROVIDER_CHECK}),
      color            TEXT NOT NULL CHECK (color IN ('primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral')),
      enabled          INTEGER NOT NULL DEFAULT 1,
      system_prompt    TEXT NOT NULL DEFAULT '',
      planning_prompt  TEXT NOT NULL DEFAULT '',
      skills_prompt    TEXT NOT NULL DEFAULT '',
      summary_prompt   TEXT NOT NULL DEFAULT '',
      report_prompt    TEXT NOT NULL DEFAULT '',
      available_set_json TEXT NOT NULL DEFAULT '[]',
      available_set_touched INTEGER NOT NULL DEFAULT 0,
      tool_needs_approval_overrides_json TEXT NOT NULL DEFAULT '{}',
      available_mcp_servers_json TEXT NOT NULL DEFAULT 'null',
      tool_loop_max_iterations INTEGER NOT NULL DEFAULT 40,
      todo_max_retries INTEGER NOT NULL DEFAULT 3,
      allow_as_sub_agent INTEGER NOT NULL DEFAULT 1,
      allow_sub_agents INTEGER NOT NULL DEFAULT 1,
      sub_agent_ids_json TEXT NOT NULL DEFAULT 'null',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      PRIMARY KEY (agent_id, user_id)
    );`
}

/** Canonical agent_configurations DDL (ReAct: skills_prompt only for step text). */
function agentConfigurationsTableDdl(tableName = 'agent_configurations'): string {
  return `CREATE TABLE ${tableName} (
      agent_id         TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      name             TEXT NOT NULL,
      description      TEXT NOT NULL DEFAULT '',
      model            TEXT NOT NULL DEFAULT '',
      provider         TEXT NOT NULL CHECK (provider IN ${AGENT_PROVIDER_CHECK}),
      color            TEXT NOT NULL CHECK (color IN ('primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral')),
      enabled          INTEGER NOT NULL DEFAULT 1,
      system_prompt    TEXT NOT NULL DEFAULT '',
      skills_prompt    TEXT NOT NULL DEFAULT '',
      available_set_json TEXT NOT NULL DEFAULT '[]',
      available_set_touched INTEGER NOT NULL DEFAULT 0,
      tool_needs_approval_overrides_json TEXT NOT NULL DEFAULT '{}',
      available_mcp_servers_json TEXT NOT NULL DEFAULT 'null',
      tool_loop_max_iterations INTEGER NOT NULL DEFAULT 40,
      todo_max_retries INTEGER NOT NULL DEFAULT 3,
      allow_as_sub_agent INTEGER NOT NULL DEFAULT 1,
      allow_sub_agents INTEGER NOT NULL DEFAULT 1,
      sub_agent_ids_json TEXT NOT NULL DEFAULT 'null',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      PRIMARY KEY (agent_id, user_id)
    );`
}

/** Migrate legacy analysis_prompt → summary_prompt; drop analysis column via table rebuild. */
function migrateAgentSummaryPromptColumn(db: Database.Database): void {
  const table = 'agent_configurations'

  if (!tableHasColumn(db, table, 'analysis_prompt')) {
    if (!tableHasColumn(db, table, 'summary_prompt')) {
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN summary_prompt TEXT NOT NULL DEFAULT '';`,
      )
    }
    return
  }

  const legacy = 'agent_configurations_legacy'
  const hasSummary = tableHasColumn(db, table, 'summary_prompt')
  const summaryExpr = hasSummary
    ? `COALESCE(NULLIF(TRIM(summary_prompt), ''), NULLIF(TRIM(analysis_prompt), ''), '')`
    : `COALESCE(NULLIF(TRIM(analysis_prompt), ''), '')`

  const pick = (column: string, fallback: string) =>
    tableHasColumn(db, table, column) ? column : fallback

  db.exec(`
    BEGIN;
    ALTER TABLE ${table} RENAME TO ${legacy};
    ${legacyAgentConfigurationsTableDdl(table)}
    INSERT INTO ${table} (
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      planning_prompt,
      skills_prompt,
      summary_prompt,
      report_prompt,
      available_set_json,
      available_set_touched,
      tool_needs_approval_overrides_json,
      available_mcp_servers_json,
      tool_loop_max_iterations,
      created_at,
      updated_at
    )
    SELECT
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      planning_prompt,
      skills_prompt,
      ${summaryExpr},
      ${pick('report_prompt', "''")},
      ${pick('available_set_json', "'[]'")},
      COALESCE(${pick('available_set_touched', '0')}, 0),
      COALESCE(${pick('tool_needs_approval_overrides_json', "'{}'")}, '{}'),
      COALESCE(${pick('available_mcp_servers_json', "'null'")}, 'null'),
      COALESCE(${pick('tool_loop_max_iterations', '40')}, 40),
      created_at,
      updated_at
    FROM ${legacy};
    DROP TABLE ${legacy};
    CREATE INDEX IF NOT EXISTS idx_agent_configurations_user_id
      ON ${table} (user_id, updated_at);
    COMMIT;
  `)
}

function migrateTokenUsage(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_token_usage (
      id                    TEXT PRIMARY KEY,
      user_id               TEXT NOT NULL DEFAULT 'default',
      recorded_at           TEXT NOT NULL,
      conversation_id       TEXT,
      agent_id              TEXT,
      assistant_message_id  TEXT,
      step_id               TEXT,
      source                TEXT NOT NULL,
      provider              TEXT,
      model                 TEXT,
      input_tokens          INTEGER NOT NULL DEFAULT 0,
      output_tokens         INTEGER NOT NULL DEFAULT 0,
      total_tokens          INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_llm_token_usage_recorded_at
      ON llm_token_usage (recorded_at);
    CREATE INDEX IF NOT EXISTS idx_llm_token_usage_user_recorded_at
      ON llm_token_usage (user_id, recorded_at);
  `)
}

function migrateConversationSandboxRuns(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_sandbox_runs (
      sandbox_root        TEXT    PRIMARY KEY,
      conversation_id     TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      results_file_url    TEXT    NOT NULL DEFAULT '',
      output_results_dir  TEXT    NOT NULL DEFAULT '',
      created_at          TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_sandbox_runs_conversation_id
      ON conversation_sandbox_runs (conversation_id);
  `)
}

function virtualTableExists(db: Database.Database, name: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(name) != null
  )
}

/**
 * Create the tool_results table plus FTS5 virtual tables for both messages and
 * tool_results.  Content tables share storage with the base table; triggers
 * keep the FTS index in sync with inserts / updates / deletes.
 *
 * On first run, existing messages are indexed via the FTS5 'rebuild' command.
 */
function migrateToolResultsAndFts(db: Database.Database): void {
  // ── tool_results base table ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_results (
      id              TEXT    PRIMARY KEY,
      conversation_id TEXT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      agent_id        TEXT    NOT NULL DEFAULT '',
      step_id         TEXT    NOT NULL DEFAULT '',
      tool_name       TEXT    NOT NULL,
      input_summary   TEXT    NOT NULL DEFAULT '',
      output_text     TEXT    NOT NULL DEFAULT '',
      output_summary  TEXT    NOT NULL DEFAULT '',
      output_chars    INTEGER NOT NULL DEFAULT 0,
      is_error        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tool_results_conversation_id
      ON tool_results (conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tool_results_tool_name
      ON tool_results (conversation_id, tool_name, created_at);
  `)

  // ── FTS5 on messages ───────────────────────────────────────────────────
  const messagesFtsNew = !virtualTableExists(db, 'messages_fts')
  if (messagesFtsNew) {
    db.exec(`
      CREATE VIRTUAL TABLE messages_fts USING fts5(
        content,
        content='messages',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 1'
      );
    `)
    // Populate from existing rows
    db.exec(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild');`)
  }

  // Sync triggers for messages_fts (idempotent — DROP IF EXISTS + recreate)
  db.exec(`
    DROP TRIGGER IF EXISTS messages_fts_ai;
    DROP TRIGGER IF EXISTS messages_fts_ad;
    DROP TRIGGER IF EXISTS messages_fts_au;

    CREATE TRIGGER messages_fts_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
    END;

    CREATE TRIGGER messages_fts_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
    END;

    CREATE TRIGGER messages_fts_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content)
        VALUES ('delete', old.rowid, old.content);
      INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
    END;
  `)

  // ── FTS5 on tool_results ───────────────────────────────────────────────
  if (!virtualTableExists(db, 'tool_results_fts')) {
    db.exec(`
      CREATE VIRTUAL TABLE tool_results_fts USING fts5(
        tool_name,
        input_summary,
        output_text,
        content='tool_results',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 1'
      );
    `)
    // Rebuild from any rows already present (empty on first run, safe to call)
    db.exec(`INSERT INTO tool_results_fts(tool_results_fts) VALUES('rebuild');`)
  }

  db.exec(`
    DROP TRIGGER IF EXISTS tool_results_fts_ai;
    DROP TRIGGER IF EXISTS tool_results_fts_ad;
    DROP TRIGGER IF EXISTS tool_results_fts_au;

    CREATE TRIGGER tool_results_fts_ai AFTER INSERT ON tool_results BEGIN
      INSERT INTO tool_results_fts(rowid, tool_name, input_summary, output_text)
        VALUES (new.rowid, new.tool_name, new.input_summary, new.output_text);
    END;

    CREATE TRIGGER tool_results_fts_ad AFTER DELETE ON tool_results BEGIN
      INSERT INTO tool_results_fts(tool_results_fts, rowid, tool_name, input_summary, output_text)
        VALUES ('delete', old.rowid, old.tool_name, old.input_summary, old.output_text);
    END;

    CREATE TRIGGER tool_results_fts_au AFTER UPDATE ON tool_results BEGIN
      INSERT INTO tool_results_fts(tool_results_fts, rowid, tool_name, input_summary, output_text)
        VALUES ('delete', old.rowid, old.tool_name, old.input_summary, old.output_text);
      INSERT INTO tool_results_fts(rowid, tool_name, input_summary, output_text)
        VALUES (new.rowid, new.tool_name, new.input_summary, new.output_text);
    END;
  `)
}

/**
 * Add thread_tag column to messages and tool_results for thread-aware context retrieval.
 * Existing rows default to 'general'.
 */
function migrateThreadTags(db: Database.Database): void {
  if (!tableHasColumn(db, 'messages', 'thread_tag')) {
    db.exec(`ALTER TABLE messages ADD COLUMN thread_tag TEXT NOT NULL DEFAULT 'general';`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_thread_tag
               ON messages (conversation_id, thread_tag, created_at);`)
  }
  if (!tableHasColumn(db, 'tool_results', 'thread_tag')) {
    db.exec(`ALTER TABLE tool_results ADD COLUMN thread_tag TEXT NOT NULL DEFAULT 'general';`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tool_results_thread_tag
               ON tool_results (conversation_id, thread_tag, created_at);`)
  }
}

function migrateSchedulersSchema(db: Database.Database): void {
  const schedulersTable = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'schedulers'",
    )
    .get() as { sql?: string } | undefined

  const tableSql = schedulersTable?.sql ?? ''
  const needsActionTypeConstraintUpgrade =
    tableSql.includes("action_type IN ('send-channel-message')") &&
    !tableSql.includes('run-agent')

  if (needsActionTypeConstraintUpgrade) {
    db.exec(`
      BEGIN;
      ALTER TABLE schedulers RENAME TO schedulers_legacy;
      CREATE TABLE schedulers (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        name             TEXT NOT NULL,
        enabled          INTEGER NOT NULL DEFAULT 1,
        schedule_type    TEXT NOT NULL CHECK (schedule_type IN ('interval', 'cron')),
        interval_ms      INTEGER,
        cron_expression  TEXT,
        timezone         TEXT,
        action_type      TEXT NOT NULL CHECK (action_type IN ('send-channel-message', 'run-agent')),
        channel_id       TEXT NOT NULL DEFAULT '',
        target           TEXT NOT NULL DEFAULT '',
        message          TEXT NOT NULL DEFAULT '',
        agent_id         TEXT NOT NULL DEFAULT '',
        conversation_id  TEXT NOT NULL DEFAULT '',
        prompt           TEXT NOT NULL DEFAULT '',
        last_run_at      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
      INSERT INTO schedulers (
        id,
        user_id,
        name,
        enabled,
        schedule_type,
        interval_ms,
        cron_expression,
        timezone,
        action_type,
        channel_id,
        target,
        message,
        last_run_at,
        created_at,
        updated_at
      )
      SELECT
        id,
        user_id,
        name,
        enabled,
        schedule_type,
        interval_ms,
        cron_expression,
        timezone,
        action_type,
        channel_id,
        target,
        message,
        last_run_at,
        created_at,
        updated_at
      FROM schedulers_legacy;
      DROP TABLE schedulers_legacy;
      CREATE INDEX IF NOT EXISTS idx_schedulers_user_id
        ON schedulers (user_id, updated_at);
      COMMIT;
    `)
  }

  if (!tableHasColumn(db, 'schedulers', 'agent_id')) {
    db.exec(`ALTER TABLE schedulers ADD COLUMN agent_id TEXT NOT NULL DEFAULT '';`)
  }
  if (!tableHasColumn(db, 'schedulers', 'conversation_id')) {
    db.exec(
      `ALTER TABLE schedulers ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';`,
    )
  }
  if (!tableHasColumn(db, 'schedulers', 'prompt')) {
    db.exec(`ALTER TABLE schedulers ADD COLUMN prompt TEXT NOT NULL DEFAULT '';`)
  }
}

function migrateConversationSettings(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_settings (
      conversation_id  TEXT PRIMARY KEY
        REFERENCES conversations(id) ON DELETE CASCADE,
      workspace_path   TEXT,
      updated_at       TEXT NOT NULL
    );
  `)
  if (!tableHasColumn(db, 'conversation_settings', 'session_approved_tools_json')) {
    db.exec(
      `ALTER TABLE conversation_settings ADD COLUMN session_approved_tools_json TEXT;`,
    )
  }
  if (!tableHasColumn(db, 'conversation_settings', 'coding_mode_json')) {
    db.exec(
      `ALTER TABLE conversation_settings ADD COLUMN coding_mode_json TEXT NOT NULL DEFAULT '"normal"';`,
    )
  }
}

function migrateConversationPlanModeState(db: Database.Database): void {
  if (!tableHasColumn(db, 'conversation_settings', 'plan_mode_json')) {
    db.exec(
      `ALTER TABLE conversation_settings ADD COLUMN plan_mode_json TEXT NOT NULL DEFAULT '{"planMode":false,"planSlug":null,"pendingPlanActivation":false,"pendingPlanExecution":false}';`,
    )
  }
}

/** Rename legacy Kimi plan mode stored value to explore mode. */
function migrateCodingModePlanToExplore(db: Database.Database): void {
  if (!tableHasColumn(db, 'conversation_settings', 'coding_mode_json')) return
  db.prepare(
    `UPDATE conversation_settings SET coding_mode_json = ? WHERE coding_mode_json = ?`,
  ).run(JSON.stringify('explore'), JSON.stringify('plan'))
}

function migrateEnableSubAgentDelegationDefault(db: Database.Database): void {
  if (!tableHasColumn(db, 'agent_configurations', 'allow_sub_agents')) return
  db.prepare(
    `UPDATE agent_configurations SET allow_sub_agents = 1 WHERE allow_sub_agents = 0`,
  ).run()
}

function migrateEnableAllowAsSubAgentDefault(db: Database.Database): void {
  if (!tableHasColumn(db, 'agent_configurations', 'allow_as_sub_agent')) return
  db.prepare(
    `UPDATE agent_configurations SET allow_as_sub_agent = 1 WHERE allow_as_sub_agent = 0`,
  ).run()
}

function migrateParentMessageId(db: Database.Database): void {
  if (!tableHasColumn(db, 'messages', 'parent_message_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN parent_message_id TEXT;`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_parent_message_id
               ON messages (parent_message_id);`)
  }
}

function migrateWorkflowsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL,
      name                TEXT NOT NULL,
      description         TEXT NOT NULL DEFAULT '',
      status              TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'testing', 'deployed')),
      current_version_id  TEXT,
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflows_user_id
      ON workflows (user_id, updated_at);

    CREATE TABLE IF NOT EXISTS workflow_versions (
      id                      TEXT PRIMARY KEY,
      workflow_id             TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      version_number          INTEGER NOT NULL,
      definition_json         TEXT NOT NULL,
      mermaid                 TEXT NOT NULL DEFAULT '',
      summary_markdown        TEXT NOT NULL DEFAULT '',
      compiler_metadata_json  TEXT NOT NULL DEFAULT '{}',
      created_at              TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id
      ON workflow_versions (workflow_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS workflow_deployments (
      id           TEXT PRIMARY KEY,
      workflow_id  TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      version_id   TEXT NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL,
      target       TEXT NOT NULL CHECK (target IN ('local', 'agent-server')),
      enabled      INTEGER NOT NULL DEFAULT 1,
      config_json  TEXT NOT NULL DEFAULT '{}',
      last_run_at  TEXT,
      last_error   TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_deployments_workflow_id
      ON workflow_deployments (workflow_id, updated_at);

    CREATE TABLE IF NOT EXISTS workflow_triggers (
      id            TEXT PRIMARY KEY,
      workflow_id   TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      deployment_id TEXT,
      trigger_type  TEXT NOT NULL,
      config_json   TEXT NOT NULL DEFAULT '{}',
      enabled       INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow_id
      ON workflow_triggers (workflow_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_triggers_type
      ON workflow_triggers (trigger_type, enabled);
  `)
}

function migrateSchedulersRunWorkflow(db: Database.Database): void {
  if (!tableHasColumn(db, 'schedulers', 'workflow_id')) {
    db.exec(`ALTER TABLE schedulers ADD COLUMN workflow_id TEXT NOT NULL DEFAULT '';`)
  }

  const schedulersTable = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'schedulers'",
    )
    .get() as { sql?: string } | undefined

  const tableSql = schedulersTable?.sql ?? ''
  if (
    tableSql.includes("'run-agent'") &&
    !tableSql.includes('run-workflow')
  ) {
    db.exec(`
      BEGIN;
      ALTER TABLE schedulers RENAME TO schedulers_legacy;
      CREATE TABLE schedulers (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        name             TEXT NOT NULL,
        enabled          INTEGER NOT NULL DEFAULT 1,
        schedule_type    TEXT NOT NULL CHECK (schedule_type IN ('interval', 'cron')),
        interval_ms      INTEGER,
        cron_expression  TEXT,
        timezone         TEXT,
        action_type      TEXT NOT NULL CHECK (action_type IN ('send-channel-message', 'run-agent', 'run-workflow')),
        channel_id       TEXT NOT NULL DEFAULT '',
        target           TEXT NOT NULL DEFAULT '',
        message          TEXT NOT NULL DEFAULT '',
        agent_id         TEXT NOT NULL DEFAULT '',
        conversation_id  TEXT NOT NULL DEFAULT '',
        prompt           TEXT NOT NULL DEFAULT '',
        workflow_id      TEXT NOT NULL DEFAULT '',
        last_run_at      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
      INSERT INTO schedulers (
        id, user_id, name, enabled, schedule_type, interval_ms, cron_expression,
        timezone, action_type, channel_id, target, message, agent_id,
        conversation_id, prompt, workflow_id, last_run_at, created_at, updated_at
      )
      SELECT
        id, user_id, name, enabled, schedule_type, interval_ms, cron_expression,
        timezone, action_type, channel_id, target, message, agent_id,
        conversation_id, prompt, '', last_run_at, created_at, updated_at
      FROM schedulers_legacy;
      DROP TABLE schedulers_legacy;
      CREATE INDEX IF NOT EXISTS idx_schedulers_user_id
        ON schedulers (user_id, updated_at);
      COMMIT;
    `)
  }
}

/** Drop planning/summary/report prompt columns; merge into skills_prompt when empty. */
function migrateDropLegacyAgentPromptColumns(db: Database.Database): void {
  const table = 'agent_configurations'
  if (!tableHasColumn(db, table, 'planning_prompt')) return

  const legacy = 'agent_configurations_react_legacy'
  const pick = (column: string, fallback: string) =>
    tableHasColumn(db, table, column) ? column : fallback

  db.exec(`
    BEGIN;
    ALTER TABLE ${table} RENAME TO ${legacy};
    ${agentConfigurationsTableDdl(table)}
    INSERT INTO ${table} (
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      skills_prompt,
      available_set_json,
      available_set_touched,
      tool_needs_approval_overrides_json,
      available_mcp_servers_json,
      tool_loop_max_iterations,
      todo_max_retries,
      allow_as_sub_agent,
      allow_sub_agents,
      sub_agent_ids_json,
      created_at,
      updated_at
    )
    SELECT
      agent_id,
      user_id,
      name,
      description,
      model,
      provider,
      color,
      enabled,
      system_prompt,
      COALESCE(
        NULLIF(TRIM(${pick('skills_prompt', "''")}), ''),
        NULLIF(TRIM(${pick('planning_prompt', "''")}), ''),
        NULLIF(TRIM(${pick('summary_prompt', "''")}), ''),
        ''
      ),
      ${pick('available_set_json', "'[]'")},
      COALESCE(${pick('available_set_touched', '0')}, 0),
      COALESCE(${pick('tool_needs_approval_overrides_json', "'{}'")}, '{}'),
      COALESCE(${pick('available_mcp_servers_json', "'null'")}, 'null'),
      COALESCE(${pick('tool_loop_max_iterations', '40')}, 40),
      COALESCE(${pick('todo_max_retries', '3')}, 3),
      COALESCE(${pick('allow_as_sub_agent', '1')}, 1),
      COALESCE(${pick('allow_sub_agents', '1')}, 1),
      COALESCE(${pick('sub_agent_ids_json', "'null'")}, 'null'),
      created_at,
      updated_at
    FROM ${legacy};
    DROP TABLE ${legacy};
    CREATE INDEX IF NOT EXISTS idx_agent_configurations_user_id
      ON ${table} (user_id, updated_at);
    COMMIT;
  `)
}
