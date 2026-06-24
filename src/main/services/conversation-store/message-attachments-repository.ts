import type Database from 'better-sqlite3'
import type { ChatAttachmentMeta } from '@shared/chat/attachments'
import type { StoredMessageAttachment } from './types'

export class MessageAttachmentsRepository {
  constructor(private readonly db: Database.Database) {}

  insertMany(rows: StoredMessageAttachment[]): void {
    if (rows.length === 0) return
    const stmt = this.db.prepare(
      `INSERT INTO message_attachments (
         id, message_id, conversation_id, original_name, mime_type, size_bytes, sandbox_path, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const tx = this.db.transaction((items: StoredMessageAttachment[]) => {
      for (const row of items) {
        stmt.run(
          row.id,
          row.messageId,
          row.conversationId,
          row.originalName,
          row.mimeType,
          row.sizeBytes,
          row.sandboxPath,
          row.createdAt,
        )
      }
    })
    tx(rows)
  }

  listForMessage(messageId: string): StoredMessageAttachment[] {
    const rows = this.db
      .prepare(
        `SELECT id, message_id, conversation_id, original_name, mime_type, size_bytes, sandbox_path, created_at
         FROM message_attachments
         WHERE message_id = ?
         ORDER BY created_at ASC`,
      )
      .all(messageId) as AttachmentRow[]
    return rows.map(rowToAttachment)
  }

  listForConversation(conversationId: string): StoredMessageAttachment[] {
    const rows = this.db
      .prepare(
        `SELECT id, message_id, conversation_id, original_name, mime_type, size_bytes, sandbox_path, created_at
         FROM message_attachments
         WHERE conversation_id = ?
         ORDER BY created_at ASC`,
      )
      .all(conversationId) as AttachmentRow[]
    return rows.map(rowToAttachment)
  }

  searchForConversation(
    conversationId: string,
    query: string,
    limit = 20,
  ): StoredMessageAttachment[] {
    const q = query.trim().toLowerCase()
    const rows = this.db
      .prepare(
        `SELECT id, message_id, conversation_id, original_name, mime_type, size_bytes, sandbox_path, created_at
         FROM message_attachments
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(conversationId, Math.max(limit * 4, 40)) as AttachmentRow[]

    const filtered = q
      ? rows.filter(
          (row) =>
            row.original_name.toLowerCase().includes(q) ||
            row.sandbox_path.toLowerCase().includes(q),
        )
      : rows

    return filtered.slice(0, limit).map(rowToAttachment)
  }
}

interface AttachmentRow {
  id: string
  message_id: string
  conversation_id: string
  original_name: string
  mime_type: string | null
  size_bytes: number
  sandbox_path: string
  created_at: string
}

function rowToAttachment(row: AttachmentRow): StoredMessageAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    conversationId: row.conversation_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sandboxPath: row.sandbox_path,
    createdAt: row.created_at,
  }
}

export function storedAttachmentToMeta(
  row: StoredMessageAttachment,
): ChatAttachmentMeta {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sandboxPath: row.sandboxPath,
    messageId: row.messageId,
  }
}
