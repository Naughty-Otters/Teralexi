import type Database from 'better-sqlite3'
import {
  isReferenceMcpServer,
  REFERENCE_MCP_SERVER_DEFINITIONS,
} from '@shared/mcp/reference-mcp-servers'
import { parseJsonObject, parseJsonStringArray } from './json-helpers'
import type { StoredMcpServer, StoredMcpTransportType } from './types'

type McpServerRow = {
  id: string
  user_id: string
  name: string
  transport_type: string
  url: string
  command: string
  args_json: string
  env_json: string
  headers_json: string
  enabled: number
  created_at: string
  updated_at: string
}

function mapRow(row: McpServerRow): StoredMcpServer {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    transportType: row.transport_type as StoredMcpTransportType,
    url: row.url,
    command: row.command,
    args: parseJsonStringArray(row.args_json),
    env: parseJsonObject(row.env_json),
    headers: parseJsonObject(row.headers_json),
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class McpServersRepository {
  constructor(private readonly db: Database.Database) {}

  ensureReferenceServers(userId: string, _workspacePath: string): void {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO mcp_servers (
        id,
        user_id,
        name,
        transport_type,
        url,
        command,
        args_json,
        env_json,
        headers_json,
        enabled,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const baseTime = Date.now()
    for (const [index, definition] of REFERENCE_MCP_SERVER_DEFINITIONS.entries()) {
      const timestamp = new Date(baseTime - index * 1000).toISOString()

      insert.run(
        definition.id,
        userId,
        definition.name,
        definition.transportType,
        '',
        definition.command,
        JSON.stringify(definition.args),
        JSON.stringify(definition.env ?? {}),
        JSON.stringify(definition.headers ?? {}),
        definition.enabled === true ? 1 : 0,
        timestamp,
        timestamp,
      )
    }
  }

  list(userId: string): StoredMcpServer[] {
    const rows = this.db
      .prepare(
        `SELECT id, user_id, name, transport_type, url, command, args_json, env_json, headers_json, enabled, created_at, updated_at
         FROM mcp_servers
         WHERE user_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(userId) as McpServerRow[]

    return rows.map(mapRow)
  }

  get(userId: string, serverId: string): StoredMcpServer | null {
    const row = this.db
      .prepare(
        `SELECT id, user_id, name, transport_type, url, command, args_json, env_json, headers_json, enabled, created_at, updated_at
         FROM mcp_servers
         WHERE user_id = ? AND id = ?`,
      )
      .get(userId, serverId) as McpServerRow | undefined

    if (!row) return null
    return mapRow(row)
  }

  create(
    server: Omit<StoredMcpServer, 'createdAt' | 'updatedAt'>,
  ): StoredMcpServer {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO mcp_servers (
          id,
          user_id,
          name,
          transport_type,
          url,
          command,
          args_json,
          env_json,
          headers_json,
          enabled,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        server.id,
        server.userId,
        server.name,
        server.transportType,
        server.url,
        server.command,
        JSON.stringify(server.args ?? []),
        JSON.stringify(server.env ?? {}),
        JSON.stringify(server.headers ?? {}),
        server.enabled ? 1 : 0,
        now,
        now,
      )

    return {
      ...server,
      createdAt: now,
      updatedAt: now,
    }
  }

  setEnabled(userId: string, serverId: string, enabled: boolean): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        'UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE user_id = ? AND id = ?',
      )
      .run(enabled ? 1 : 0, now, userId, serverId)
  }

  delete(userId: string, serverId: string): void {
    if (isReferenceMcpServer({ id: serverId })) {
      throw new Error('Cannot delete a built-in MCP server.')
    }

    this.db
      .prepare('DELETE FROM mcp_servers WHERE user_id = ? AND id = ?')
      .run(userId, serverId)
  }
}
