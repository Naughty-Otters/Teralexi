import type Database from 'better-sqlite3'

/** Idempotent schema setup for memory vector storage. */
export function runVectorMemoryMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_records (
      record_id         TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      agent_id          TEXT NOT NULL,
      conversation_id   TEXT NOT NULL,
      block_id          TEXT NOT NULL,
      message_id        TEXT,
      -- v1 ingest maps user/assistant messages only; step-output types reserved for later.
      source_type       TEXT NOT NULL CHECK (source_type IN ('user-instruction', 'assistant-summary', 'step-output', 'tool-result-summary')),
      text_content      TEXT NOT NULL,
      text_hash         TEXT NOT NULL,
      embedding_status  TEXT NOT NULL DEFAULT 'pending' CHECK (embedding_status IN ('pending', 'ready', 'failed')),
      importance        REAL NOT NULL DEFAULT 1.0,
      event_at          TEXT NOT NULL,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_embeddings (
      record_id       TEXT PRIMARY KEY REFERENCES memory_records(record_id) ON DELETE CASCADE,
      model_id        TEXT NOT NULL,
      model_revision  TEXT NOT NULL DEFAULT '',
      dimensions      INTEGER NOT NULL,
      vector_json     TEXT NOT NULL,
      vector_norm     REAL NOT NULL,
      embedded_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_backfill_state (
      id                 TEXT PRIMARY KEY,
      source_kind        TEXT NOT NULL,
      source_cursor      TEXT NOT NULL DEFAULT '',
      last_processed_at  TEXT,
      updated_at         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_records_user_event
      ON memory_records (user_id, event_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memory_records_user_agent_event
      ON memory_records (user_id, agent_id, event_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memory_records_user_conv_event
      ON memory_records (user_id, conversation_id, event_at DESC);

    CREATE INDEX IF NOT EXISTS idx_memory_records_status_updated
      ON memory_records (embedding_status, updated_at);

    CREATE INDEX IF NOT EXISTS idx_memory_records_text_hash
      ON memory_records (user_id, text_hash);
  `)
}
