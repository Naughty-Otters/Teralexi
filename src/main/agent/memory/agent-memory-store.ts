import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  getAgentMemoryDirs,
  getGlobalPersonaSnapshotPath,
  getTeralexiMemoryDir,
  resolveAgentPersonaSnapshotPath,
  resolveGlobalPersonaSnapshotPath,
} from '@config/teralexi-home'
import { appCache } from '@main/cache/app-cache'
import {
  AGENT_MEMORY_PERSONA_SNAPSHOT_FILE,
  MEMORY_ROOT_RESERVED_DIR_NAMES,
} from './constants'
import type {
  AgentMemoryBlock,
  AgentMemoryPersonaSnapshot,
  AgentMemorySessionSnapshot,
} from './types'

function blockFilePath(agentId: string, blockId: string): string {
  const { block } = getAgentMemoryDirs(agentId)
  return join(block, `${blockId}.json`)
}

function sessionSnapshotPath(agentId: string, conversationId: string): string {
  const { session } = getAgentMemoryDirs(agentId)
  return join(session, `${conversationId}.json`)
}

function agentPersonaSnapshotPath(agentId: string): string {
  return resolveAgentPersonaSnapshotPath(agentId)
}

/** @deprecated Per-agent persona; read only for migration into global profile. */
function legacyPersonaSnapshotPath(agentId: string): string {
  return agentPersonaSnapshotPath(agentId)
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function listAgentMemoryRootIds(): string[] {
  const memoryRoot = getTeralexiMemoryDir()
  try {
    return readdirSync(memoryRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !MEMORY_ROOT_RESERVED_DIR_NAMES.has(entry.name),
      )
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

function loadSessionSnapshotsFromDir(sessionDir: string): AgentMemorySessionSnapshot[] {
  let files: string[] = []
  try {
    files = readdirSync(sessionDir).filter((name) => name.endsWith('.json'))
  } catch {
    return []
  }

  const snapshots: AgentMemorySessionSnapshot[] = []
  for (const file of files) {
    const snap = readJsonFile<AgentMemorySessionSnapshot>(join(sessionDir, file))
    if (snap?.conversationId?.trim() && snap.agentId?.trim()) {
      snapshots.push(snap)
    }
  }
  return snapshots
}

export function loadSessionMemorySnapshot(
  agentId: string,
  conversationId: string,
): AgentMemorySessionSnapshot | null {
  return readJsonFile<AgentMemorySessionSnapshot>(
    sessionSnapshotPath(agentId, conversationId),
  )
}

/** All raw `block/` exchanges for one conversation, oldest first. */
export function loadAllMemoryBlocksForConversation(
  agentId: string,
  conversationId: string,
): AgentMemoryBlock[] {
  const { block: blockDir } = getAgentMemoryDirs(agentId)
  const prefix = `${conversationId.trim()}_`
  if (!prefix || prefix === '_') return []

  let files: string[] = []
  try {
    files = readdirSync(blockDir).filter(
      (name) => name.endsWith('.json') && name.startsWith(prefix),
    )
  } catch {
    return []
  }

  const blocks: AgentMemoryBlock[] = []
  for (const file of files) {
    const blockId = file.slice(0, -'.json'.length)
    const block = readJsonFile<AgentMemoryBlock>(blockFilePath(agentId, blockId))
    if (
      block?.conversationId === conversationId &&
      block.agentId === agentId &&
      block.messages?.length
    ) {
      blocks.push(block)
    }
  }

  return blocks.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
}

/** All raw `block/` exchanges for one agent, oldest first. */
export function loadAllMemoryBlocksForAgent(
  agentId: string,
): AgentMemoryBlock[] {
  const { block: blockDir } = getAgentMemoryDirs(agentId)
  let files: string[] = []
  try {
    files = readdirSync(blockDir).filter((name) => name.endsWith('.json'))
  } catch {
    return []
  }

  const blocks: AgentMemoryBlock[] = []
  for (const file of files) {
    const blockId = file.slice(0, -'.json'.length)
    const block = readJsonFile<AgentMemoryBlock>(blockFilePath(agentId, blockId))
    if (block?.agentId === agentId && block.messages?.length) {
      blocks.push(block)
    }
  }
  return blocks.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
}

/** Deletes oldest block files until at most `maxBlocks` remain for the agent. */
export function pruneAgentMemoryBlocks(
  agentId: string,
  maxBlocks: number,
): void {
  const blocks = loadAllMemoryBlocksForAgent(agentId)
  if (blocks.length <= maxBlocks) return
  const excess = blocks.length - maxBlocks
  for (let i = 0; i < excess; i++) {
    const path = blockFilePath(agentId, blocks[i]!.blockId)
    if (existsSync(path)) unlinkSync(path)
  }
}

/** Deletes oldest session snapshots until at most `maxSessions` remain for the agent. */
export function pruneAgentSessionSnapshots(
  agentId: string,
  maxSessions: number,
): void {
  const sessions = loadAllSessionMemorySnapshots(agentId)
  if (sessions.length <= maxSessions) return
  const toDelete = sessions.slice(maxSessions)
  for (const snap of toDelete) {
    const path = sessionSnapshotPath(snap.agentId, snap.conversationId)
    if (existsSync(path)) unlinkSync(path)
  }
}

/** Per-agent persona at `memory/<agent-id>/persona/profile.json`. */
export function loadAgentPersonaSnapshot(
  agentId: string,
): AgentMemoryPersonaSnapshot | null {
  return readJsonFile<AgentMemoryPersonaSnapshot>(
    resolveAgentPersonaSnapshotPath(agentId),
  )
}

export function persistAgentPersonaSnapshot(
  snapshot: AgentMemoryPersonaSnapshot,
): void {
  const { persona } = getAgentMemoryDirs(snapshot.agentId)
  writeFileSync(
    join(persona, AGENT_MEMORY_PERSONA_SNAPSHOT_FILE),
    JSON.stringify(snapshot, null, 2),
    'utf8',
  )
  // Persona cache may be stale for any user that references this agent.
  appCache.invalidateAllPersona()
}

/** Every per-agent persona file for a user (one profile per agent under `memory/<agent-id>/persona/`). */
export function loadAllAgentPersonaSnapshotsForUser(
  userId: string,
): AgentMemoryPersonaSnapshot[] {
  const normalizedUserId = userId.trim()
  const snapshots: AgentMemoryPersonaSnapshot[] = []

  for (const agentRootId of listAgentMemoryRootIds()) {
    const snap = loadAgentPersonaSnapshot(agentRootId)
    if (!snap) continue
    if (normalizedUserId && snap.userId !== normalizedUserId) continue
    snapshots.push(snap)
  }

  return snapshots.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * Global persona for a user (all agents). Falls back to legacy per-agent `persona/profile.json`.
 */
export function loadPersonaMemorySnapshot(
  userId: string,
  legacyAgentId?: string,
): AgentMemoryPersonaSnapshot | null {
  const global = readJsonFile<AgentMemoryPersonaSnapshot>(
    resolveGlobalPersonaSnapshotPath(userId),
  )
  if (global) return global

  if (legacyAgentId?.trim()) {
    const legacy = readJsonFile<AgentMemoryPersonaSnapshot>(
      legacyPersonaSnapshotPath(legacyAgentId),
    )
    if (legacy && legacy.userId === userId) return legacy
  }

  return null
}

/** Every `session/<conversationId>.json` snapshot for one agent, newest first. */
export function loadAllSessionMemorySnapshots(
  agentId: string,
): AgentMemorySessionSnapshot[] {
  const { session: sessionDir } = getAgentMemoryDirs(agentId)
  return loadSessionSnapshotsFromDir(sessionDir)
    .filter((snap) => snap.agentId === agentId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Last `limit` session snapshots for one agent only (newest first). */
export function loadRecentSessionMemorySnapshotsForAgent(
  agentId: string,
  limit: number,
): AgentMemorySessionSnapshot[] {
  if (limit <= 0) return []
  return loadAllSessionMemorySnapshots(agentId).slice(0, limit)
}

/**
 * All session snapshots for a user across every agent under `memory/<agent-id>/session/`.
 */
export function loadAllSessionMemorySnapshotsForUser(
  userId: string,
): AgentMemorySessionSnapshot[] {
  const normalizedUserId = userId.trim()
  const byKey = new Map<string, AgentMemorySessionSnapshot>()

  for (const agentRootId of listAgentMemoryRootIds()) {
    const sessionDir = join(getTeralexiMemoryDir(), agentRootId, 'session')
    for (const snap of loadSessionSnapshotsFromDir(sessionDir)) {
      if (normalizedUserId && snap.userId !== normalizedUserId) continue
      const key = `${snap.agentId}::${snap.conversationId}`
      const existing = byKey.get(key)
      if (!existing || existing.updatedAt < snap.updatedAt) {
        byKey.set(key, snap)
      }
    }
  }

  return [...byKey.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )
}

/** Persist raw exchange under `block/`. */
export function persistAgentMemoryBlock(block: AgentMemoryBlock): void {
  writeFileSync(
    blockFilePath(block.agentId, block.blockId),
    JSON.stringify(block, null, 2),
    'utf8',
  )
}

export function persistSessionMemorySnapshot(
  snapshot: AgentMemorySessionSnapshot,
): void {
  writeFileSync(
    sessionSnapshotPath(snapshot.agentId, snapshot.conversationId),
    JSON.stringify(snapshot, null, 2),
    'utf8',
  )
}

/** Writes global user persona under `memory/users/<userId>/persona/profile.json`. */
export function persistUserPersonaMemorySnapshot(
  snapshot: AgentMemoryPersonaSnapshot,
): void {
  writeFileSync(
    getGlobalPersonaSnapshotPath(snapshot.userId),
    JSON.stringify(snapshot, null, 2),
    'utf8',
  )
  // Invalidate all persona cache entries for this user
  appCache.invalidateAllPersona(snapshot.userId)
}

/** @deprecated Use {@link persistUserPersonaMemorySnapshot}. */
export function persistPersonaMemorySnapshot(
  snapshot: AgentMemoryPersonaSnapshot,
): void {
  persistUserPersonaMemorySnapshot(snapshot)
}
