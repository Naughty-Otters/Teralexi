import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createLogger } from '@main/logger'
import {
  emptyFollowUpMeta,
  FOLLOWUP_META_REL_PATH,
  parseFollowUpMeta,
  type FollowUpMeta,
} from '@shared/agent/follow-up'
import { notifyConversationFollowUpsChanged } from '@main/services/follow-up-notify'

const log = createLogger('agent.follow-up.store')

type CatalogGate = {
  revision: number
  /** When false, writes are rejected until the next turn start re-enables them. */
  writesEnabled: boolean
}

/** Per-conversation catalog revision + write gate (process-local). */
const catalogGates = new Map<string, CatalogGate>()

function gateFor(conversationId: string): CatalogGate {
  const id = conversationId.trim()
  let gate = catalogGates.get(id)
  if (!gate) {
    gate = { revision: 0, writesEnabled: true }
    catalogGates.set(id, gate)
  }
  return gate
}

/** Ensure in-memory revision is at least as high as a value from disk. */
function syncGateRevision(conversationId: string, revision: number | undefined): void {
  if (typeof revision !== 'number' || !Number.isFinite(revision)) return
  const gate = gateFor(conversationId)
  const next = Math.trunc(revision)
  if (next > gate.revision) gate.revision = next
}

/** @internal Test helper. */
export function resetFollowUpCatalogGatesForTests(): void {
  catalogGates.clear()
}

/** Absolute path to `<sandbox>/followup/meta.json`. */
export function followUpMetaPath(sandboxRoot: string): string {
  return join(sandboxRoot, FOLLOWUP_META_REL_PATH)
}

export function readFollowUpMeta(
  sandboxRoot: string,
  conversationId: string,
): FollowUpMeta {
  const file = followUpMetaPath(sandboxRoot)
  if (!existsSync(file)) return emptyFollowUpMeta(conversationId)
  try {
    const parsed = parseFollowUpMeta(JSON.parse(readFileSync(file, 'utf8')))
    if (!parsed) return emptyFollowUpMeta(conversationId)
    syncGateRevision(conversationId, parsed.revision)
    return parsed
  } catch (err) {
    log.warn('Failed to read follow-up meta; treating as empty', { file, err })
    return emptyFollowUpMeta(conversationId)
  }
}

export type WriteFollowUpMetaResult =
  | { ok: true; path: string; revision: number; meta: FollowUpMeta }
  | { ok: false; reason: 'writes_disabled' | 'io_error' }

/**
 * Write follow-up catalog. Creates `followup/` when missing.
 * Rejected when the catalog was cleared by the UI and the next turn has not started.
 */
export function writeFollowUpMeta(
  sandboxRoot: string,
  meta: FollowUpMeta,
): WriteFollowUpMetaResult {
  const conversationId = meta.conversationId.trim()
  const gate = gateFor(conversationId)
  if (!gate.writesEnabled) {
    return { ok: false, reason: 'writes_disabled' }
  }

  gate.revision += 1
  const revision = gate.revision
  const toWrite: FollowUpMeta = { ...meta, revision }
  const file = followUpMetaPath(sandboxRoot)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(toWrite, null, 2), 'utf8')
  } catch (err) {
    log.warn('Failed to write follow-up meta', { file, err })
    return { ok: false, reason: 'io_error' }
  }
  try {
    notifyConversationFollowUpsChanged(
      conversationId,
      toWrite.followUps,
      revision,
    )
  } catch {
    // Notify is best-effort; file write already succeeded.
  }
  return { ok: true, path: file, revision, meta: toWrite }
}

export type ClearFollowUpMetaOptions = {
  /**
   * `true` after a new agent turn starts (writes allowed again).
   * `false` after the user dismisses chips / sends a message (block late writes).
   * Default: `false`.
   */
  enableWrites?: boolean
}

export type ClearFollowUpMetaResult = {
  ok: boolean
  revision: number
}

/** Delete `followup/meta.json` if present and bump revision for notify/race handling. */
export function clearFollowUpMeta(
  sandboxRoot: string,
  conversationId: string,
  options: ClearFollowUpMetaOptions = {},
): ClearFollowUpMetaResult {
  const id = conversationId.trim()
  const gate = gateFor(id)
  gate.revision += 1
  gate.writesEnabled = options.enableWrites === true
  const revision = gate.revision

  const file = followUpMetaPath(sandboxRoot)
  if (existsSync(file)) {
    try {
      unlinkSync(file)
    } catch (err) {
      log.warn('Failed to delete follow-up meta', { file, err })
      return { ok: false, revision }
    }
  }

  try {
    notifyConversationFollowUpsChanged(id, [], revision)
  } catch {
    /* ignore */
  }
  return { ok: true, revision }
}
