import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getTeralexiMemoryVectorsDbPath } from '@config/teralexi-home'
import { openAppSqliteDatabase } from '@main/services/sqlite/open-app-database'
import type {
  AgentMemoryBlock,
  AgentMemoryMessage,
  MemoryVectorSourceType,
} from './types'
import { runVectorMemoryMigrations } from './vector-memory-migrations'

type MemoryRecordRow = {
  recordId: string
  userId: string
  agentId: string
  conversationId: string
  blockId: string
  messageId: string | null
  sourceType: MemoryVectorSourceType
  textContent: string
  textHash: string
  embeddingStatus: 'pending' | 'ready' | 'failed'
  importance: number
  eventAt: string
  createdAt: string
  updatedAt: string
}

const UPSERT_RECORD_SQL = `
INSERT INTO memory_records (
  record_id,
  user_id,
  agent_id,
  conversation_id,
  block_id,
  message_id,
  source_type,
  text_content,
  text_hash,
  embedding_status,
  importance,
  event_at,
  created_at,
  updated_at
) VALUES (
  @recordId,
  @userId,
  @agentId,
  @conversationId,
  @blockId,
  @messageId,
  @sourceType,
  @textContent,
  @textHash,
  @embeddingStatus,
  @importance,
  @eventAt,
  @createdAt,
  @updatedAt
)
ON CONFLICT(record_id) DO UPDATE SET
  source_type = excluded.source_type,
  text_content = excluded.text_content,
  text_hash = excluded.text_hash,
  event_at = excluded.event_at,
  importance = excluded.importance,
  updated_at = excluded.updated_at,
  embedding_status = CASE
    WHEN memory_records.text_hash != excluded.text_hash THEN 'pending'
    ELSE memory_records.embedding_status
  END
`

function normalizeTextForHash(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

function textHash(content: string): string {
  return createHash('sha256')
    .update(normalizeTextForHash(content), 'utf8')
    .digest('hex')
}

function messageToSourceType(message: AgentMemoryMessage): MemoryVectorSourceType {
  return message.role === 'user' ? 'user-instruction' : 'assistant-summary'
}

function buildRecordRow(block: AgentMemoryBlock, message: AgentMemoryMessage): MemoryRecordRow {
  const now = new Date().toISOString()
  return {
    recordId: createHash('sha256')
      .update(
        [
          block.userId,
          block.agentId,
          block.conversationId,
          block.blockId,
          message.id,
          message.role,
        ].join('::'),
        'utf8',
      )
      .digest('hex'),
    userId: block.userId,
    agentId: block.agentId,
    conversationId: block.conversationId,
    blockId: block.blockId,
    messageId: message.id,
    sourceType: messageToSourceType(message),
    textContent: message.content,
    textHash: textHash(message.content),
    embeddingStatus: 'pending',
    importance: 1,
    eventAt: message.createdAt || block.recordedAt,
    createdAt: now,
    updatedAt: now,
  }
}

export class MemoryVectorStore {
  private readonly db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db ?? openAppSqliteDatabase(getTeralexiMemoryVectorsDbPath())
    runVectorMemoryMigrations(this.db)
  }

  upsertBlock(block: AgentMemoryBlock): void {
    const stmt = this.db.prepare(UPSERT_RECORD_SQL)
    const runRows = (rows: MemoryRecordRow[]) => {
      for (const row of rows) {
        stmt.run(row)
      }
    }

    const rows = block.messages
      .map((message) => {
        const content = message.content?.trim()
        if (!content) return null
        return buildRecordRow(block, { ...message, content })
      })
      .filter((row): row is MemoryRecordRow => row !== null)

    if (rows.length === 0) return

    const tx = (this.db as { transaction?: (fn: typeof runRows) => typeof runRows })
      .transaction
    if (tx) {
      tx(runRows)(rows)
      return
    }

    runRows(rows)
  }
}

let memoryVectorStore: MemoryVectorStore | null = null

export function getMemoryVectorStore(): MemoryVectorStore {
  if (!memoryVectorStore) {
    memoryVectorStore = new MemoryVectorStore()
  }
  return memoryVectorStore
}

export function persistMemoryVectorRecordsFromBlock(block: AgentMemoryBlock): void {
  getMemoryVectorStore().upsertBlock(block)
}

/** @internal test helper */
export function resetMemoryVectorStoreForTests(): void {
  memoryVectorStore = null
}
