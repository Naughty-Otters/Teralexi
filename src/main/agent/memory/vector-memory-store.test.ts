import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createMigrationTestDatabase } from '@main/services/conversation-store/migration-test-db'
import { runVectorMemoryMigrations } from './vector-memory-migrations'
import { MemoryVectorStore } from './vector-memory-store'
import type { AgentMemoryBlock } from './types'

function columnNames(db: Database.Database, table: string): string[] {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>
  return cols.map((c) => c.name)
}

describe('vector memory schema', () => {
  it('creates required tables and indexes idempotently', () => {
    const db = createMigrationTestDatabase()

    runVectorMemoryMigrations(db)
    expect(() => runVectorMemoryMigrations(db)).not.toThrow()

    expect(columnNames(db, 'memory_records')).toEqual(
      expect.arrayContaining([
        'record_id',
        'user_id',
        'agent_id',
        'conversation_id',
        'source_type',
        'text_content',
        'embedding_status',
      ]),
    )
    expect(columnNames(db, 'memory_embeddings')).toEqual(
      expect.arrayContaining(['record_id', 'model_id', 'vector_json']),
    )
    expect(columnNames(db, 'memory_backfill_state')).toEqual(
      expect.arrayContaining(['id', 'source_kind', 'source_cursor']),
    )
  })
})

describe('MemoryVectorStore', () => {
  it('upserts one vector-memory record per persisted message', () => {
    const db = createMigrationTestDatabase()
    const store = new MemoryVectorStore(db)

    const block: AgentMemoryBlock = {
      blockId: 'conv-1_msg-2',
      agentId: 'coding-agent',
      conversationId: 'conv-1',
      userId: 'user-1',
      recordedAt: '2026-06-10T00:00:00.000Z',
      messages: [
        {
          role: 'user',
          id: 'msg-1',
          content: 'Please remember that I prefer concise diffs.',
          createdAt: '2026-06-10T00:00:00.000Z',
        },
        {
          role: 'assistant',
          id: 'msg-2',
          content: 'Understood. I will keep patches focused and minimal.',
          createdAt: '2026-06-10T00:00:05.000Z',
        },
      ],
    }

    store.upsertBlock(block)

    const rows = db
      .prepare(
        `SELECT user_id, agent_id, source_type, embedding_status, message_id
         FROM memory_records
         ORDER BY message_id`,
      )
      .all() as Array<{
      user_id: string
      agent_id: string
      source_type: string
      embedding_status: string
      message_id: string
    }>

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      agent_id: 'coding-agent',
      source_type: 'user-instruction',
      embedding_status: 'pending',
      message_id: 'msg-1',
    })
    expect(rows[1]).toMatchObject({
      source_type: 'assistant-summary',
      message_id: 'msg-2',
    })
  })
})
