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
    return parsed
  } catch (err) {
    log.warn('Failed to read follow-up meta; treating as empty', { file, err })
    return emptyFollowUpMeta(conversationId)
  }
}

/**
 * Write follow-up catalog. Creates `followup/` when missing.
 * Returns the absolute path written, or null on failure.
 */
export function writeFollowUpMeta(
  sandboxRoot: string,
  meta: FollowUpMeta,
): string | null {
  const file = followUpMetaPath(sandboxRoot)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(meta, null, 2), 'utf8')
    notifyConversationFollowUpsChanged(meta.conversationId, meta.followUps)
    return file
  } catch (err) {
    log.warn('Failed to write follow-up meta', { file, err })
    return null
  }
}

/** Delete `followup/meta.json` if present. Returns true when removed or already absent. */
export function clearFollowUpMeta(
  sandboxRoot: string,
  conversationId?: string,
): boolean {
  const file = followUpMetaPath(sandboxRoot)
  if (!existsSync(file)) {
    if (conversationId?.trim()) {
      notifyConversationFollowUpsChanged(conversationId.trim(), [])
    }
    return true
  }
  try {
    unlinkSync(file)
    if (conversationId?.trim()) {
      notifyConversationFollowUpsChanged(conversationId.trim(), [])
    }
    return true
  } catch (err) {
    log.warn('Failed to delete follow-up meta', { file, err })
    return false
  }
}
