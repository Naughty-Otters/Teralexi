import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createMigrationTestDatabase } from './migration-test-db'
import { runMigrations } from './migrations'
import { ConversationsRepository } from './conversations-repository'
import { MessagesRepository } from './messages-repository'
import { ToolResultsRepository } from './tool-results-repository'
import type { StoredToolResult } from './types'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function freshDb(): Database.Database {
  const db = createMigrationTestDatabase()
  runMigrations(db)
  return db
}

let counter = 0

function makeConversation(db: Database.Database, agentId = 'agent-1'): string {
  const id = `conv-${++counter}`
  db.prepare(
    'INSERT INTO conversations (id, agent_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, agentId, 'Test', new Date().toISOString(), new Date().toISOString())
  return id
}

function makeResult(
  overrides: Partial<StoredToolResult> & { conversationId: string },
): StoredToolResult {
  return {
    id: `tr-${++counter}`,
    agentId: 'agent-1',
    stepId: 'toolLoop',
    toolName: 'read_file',
    inputSummary: 'path=/src/main.ts',
    outputText: 'export function main() {}',
    outputSummary: '[read_file] 26 chars: "export function main() {}"',
    outputChars: 26,
    isError: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// ToolResultsRepository — CRUD
// ---------------------------------------------------------------------------

describe('ToolResultsRepository — save and list', () => {
  it('saves and retrieves results for a conversation', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    repo.save(makeResult({ conversationId: convId, toolName: 'read_file', id: 'r1' }))
    repo.save(makeResult({ conversationId: convId, toolName: 'run_script', id: 'r2' }))

    const all = repo.list(convId)
    expect(all).toHaveLength(2)
    expect(all.map((r) => r.toolName)).toEqual(['read_file', 'run_script'])
  })

  it('filters by toolName', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    repo.save(makeResult({ conversationId: convId, toolName: 'read_file', id: 'r1' }))
    repo.save(makeResult({ conversationId: convId, toolName: 'run_script', id: 'r2' }))
    repo.save(makeResult({ conversationId: convId, toolName: 'read_file', id: 'r3' }))

    const reads = repo.list(convId, { toolName: 'read_file' })
    expect(reads).toHaveLength(2)
    expect(reads.every((r) => r.toolName === 'read_file')).toBe(true)
  })

  it('does not return results from other conversations', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const conv1 = makeConversation(db)
    const conv2 = makeConversation(db)

    repo.save(makeResult({ conversationId: conv1, id: 'r1' }))
    repo.save(makeResult({ conversationId: conv2, id: 'r2' }))

    expect(repo.list(conv1)).toHaveLength(1)
    expect(repo.list(conv2)).toHaveLength(1)
  })

  it('respects limit option', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    for (let i = 0; i < 5; i++) {
      repo.save(makeResult({ conversationId: convId, id: `r${i}` }))
    }

    const limited = repo.list(convId, { limit: 3 })
    expect(limited).toHaveLength(3)
  })

  it('ON CONFLICT DO NOTHING — duplicate id is silently ignored', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    repo.save(makeResult({ conversationId: convId, id: 'dup', toolName: 'read_file' }))
    repo.save(makeResult({ conversationId: convId, id: 'dup', toolName: 'write_file' })) // ignored

    const all = repo.list(convId)
    expect(all).toHaveLength(1)
    expect(all[0].toolName).toBe('read_file')
  })
})

// ---------------------------------------------------------------------------
// ToolResultsRepository — getOlderThan
// ---------------------------------------------------------------------------

describe('ToolResultsRepository — getOlderThan', () => {
  it('returns all results when keepRecentN is 0', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    for (let i = 0; i < 4; i++) {
      repo.save(makeResult({ conversationId: convId, id: `r${i}` }))
    }

    const older = repo.getOlderThan(convId, 0)
    expect(older).toHaveLength(4)
  })

  it('returns only the older entries', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    for (let i = 0; i < 5; i++) {
      repo.save(makeResult({ conversationId: convId, id: `r${i}` }))
    }

    const older = repo.getOlderThan(convId, 2) // keep 2 recent, get 3 older
    expect(older).toHaveLength(3)
  })

  it('returns empty array when all are within recent window', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    for (let i = 0; i < 3; i++) {
      repo.save(makeResult({ conversationId: convId, id: `r${i}` }))
    }

    const older = repo.getOlderThan(convId, 10)
    expect(older).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// ToolResultsRepository — FTS5 search
// ---------------------------------------------------------------------------

describe('ToolResultsRepository — FTS5 search', () => {
  it('finds results by output text content', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    repo.save(
      makeResult({
        conversationId: convId,
        id: 'r1',
        outputText: 'function handleAuth(token: string) { return validate(token) }',
      }),
    )
    repo.save(
      makeResult({
        conversationId: convId,
        id: 'r2',
        outputText: 'interface DatabaseConfig { host: string; port: number }',
      }),
    )

    const hits = repo.search('handleAuth', { conversationId: convId })
    expect(hits).toHaveLength(1)
    expect(hits[0].id).toBe('r1')
  })

  it('finds results by tool name', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    repo.save(makeResult({ conversationId: convId, id: 'r1', toolName: 'read_file' }))
    repo.save(makeResult({ conversationId: convId, id: 'r2', toolName: 'run_script' }))

    const hits = repo.search('run_script', { conversationId: convId })
    expect(hits).toHaveLength(1)
    expect(hits[0].id).toBe('r2')
  })

  it('finds results by input summary (file path)', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    repo.save(
      makeResult({
        conversationId: convId,
        id: 'r1',
        inputSummary: 'path=/src/auth/login.ts',
        outputText: 'export function login() {}',
      }),
    )
    repo.save(
      makeResult({
        conversationId: convId,
        id: 'r2',
        inputSummary: 'path=/src/db/schema.ts',
        outputText: 'export const schema = {}',
      }),
    )

    const hits = repo.search('login', { conversationId: convId })
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits.some((h) => h.id === 'r1')).toBe(true)
  })

  it('scopes search to a conversation when conversationId provided', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const conv1 = makeConversation(db)
    const conv2 = makeConversation(db)

    repo.save(makeResult({ conversationId: conv1, id: 'r1', outputText: 'secret_token here' }))
    repo.save(makeResult({ conversationId: conv2, id: 'r2', outputText: 'secret_token here' }))

    const hits = repo.search('secret_token', { conversationId: conv1 })
    expect(hits).toHaveLength(1)
    expect(hits[0].id).toBe('r1')
  })

  it('returns empty for no match', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    repo.save(makeResult({ conversationId: convId, id: 'r1', outputText: 'hello world' }))

    const hits = repo.search('xyzzy_notfound', { conversationId: convId })
    expect(hits).toHaveLength(0)
  })

  it('respects limit', () => {
    const db = freshDb()
    const repo = new ToolResultsRepository(db)
    const convId = makeConversation(db)

    for (let i = 0; i < 5; i++) {
      repo.save(makeResult({ conversationId: convId, id: `r${i}`, outputText: 'common keyword here' }))
    }

    const hits = repo.search('common', { conversationId: convId, limit: 3 })
    expect(hits).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// MessagesRepository — FTS5 search
// ---------------------------------------------------------------------------

describe('MessagesRepository — FTS5 search', () => {
  function makeConversationsRepo(db: Database.Database) {
    return new ConversationsRepository(db)
  }

  it('finds messages by content', () => {
    const db = freshDb()
    const conversations = makeConversationsRepo(db)
    const messages = new MessagesRepository(db, conversations)
    const convId = makeConversation(db)

    messages.save({
      id: 'm1',
      conversationId: convId,
      agentId: 'agent-1',
      role: 'user',
      content: 'How do I configure the authentication middleware?',
      createdAt: new Date().toISOString(),
    })
    messages.save({
      id: 'm2',
      conversationId: convId,
      agentId: 'agent-1',
      role: 'assistant',
      content: 'The authentication middleware is configured in config/auth.ts',
      createdAt: new Date().toISOString(),
    })

    const hits = messages.search('authentication', { conversationId: convId })
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits.every((h) => h.content.toLowerCase().includes('auth'))).toBe(true)
  })

  it('scopes search to conversation', () => {
    const db = freshDb()
    const conversations = makeConversationsRepo(db)
    const messages = new MessagesRepository(db, conversations)
    const conv1 = makeConversation(db)
    const conv2 = makeConversation(db)

    messages.save({
      id: 'm1', conversationId: conv1, agentId: 'a', role: 'user',
      content: 'unique_keyword_abc', createdAt: new Date().toISOString(),
    })
    messages.save({
      id: 'm2', conversationId: conv2, agentId: 'a', role: 'user',
      content: 'unique_keyword_abc', createdAt: new Date().toISOString(),
    })

    const hits = messages.search('unique_keyword_abc', { conversationId: conv1 })
    expect(hits).toHaveLength(1)
    expect(hits[0].id).toBe('m1')
  })

  it('returns empty for no match', () => {
    const db = freshDb()
    const conversations = makeConversationsRepo(db)
    const messages = new MessagesRepository(db, conversations)
    const convId = makeConversation(db)

    messages.save({
      id: 'm1', conversationId: convId, agentId: 'a', role: 'user',
      content: 'hello world', createdAt: new Date().toISOString(),
    })

    const hits = messages.search('xyzzy_notfound')
    expect(hits).toHaveLength(0)
  })

  it('FTS index stays in sync after update', () => {
    const db = freshDb()
    const conversations = makeConversationsRepo(db)
    const messages = new MessagesRepository(db, conversations)
    const convId = makeConversation(db)

    messages.save({
      id: 'm1', conversationId: convId, agentId: 'a', role: 'assistant',
      content: 'original content here', createdAt: new Date().toISOString(),
    })

    // Update content
    messages.update('m1', 'completely revised message now')

    const oldHits = messages.search('original')
    expect(oldHits).toHaveLength(0)

    const newHits = messages.search('revised')
    expect(newHits.length).toBeGreaterThanOrEqual(1)
    expect(newHits[0].id).toBe('m1')
  })
})

// ---------------------------------------------------------------------------
// Migration idempotency
// ---------------------------------------------------------------------------

describe('migrateToolResultsAndFts — idempotency', () => {
  it('running migrations twice does not throw', () => {
    const db = freshDb()
    expect(() => runMigrations(db)).not.toThrow()
  })

  it('tool_results table exists after migration', () => {
    const db = freshDb()
    const row = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tool_results'")
      .get()
    expect(row).toBeTruthy()
  })

  it('messages_fts virtual table exists after migration', () => {
    const db = freshDb()
    const row = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='messages_fts'")
      .get()
    expect(row).toBeTruthy()
  })

  it('tool_results_fts virtual table exists after migration', () => {
    const db = freshDb()
    const row = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tool_results_fts'")
      .get()
    expect(row).toBeTruthy()
  })
})
