/**
 * Reuses one {@link Sandbox} per conversation so multiple agent turns in the same
 * chat share the same working directory. Ephemeral runs (no conversation id) keep
 * a fresh directory under `~/.openfde/workspace/sandbox/`.
 */

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { getopenfdeSandboxDir } from '@config/openfde-home'
import { Sandbox } from './sandbox-impl'
import type { SandboxPlanningAccess } from './types'

const registry = new Map<string, Sandbox>()

/** Sandbox root for a conversation when it is already in the registry (sync). */
export function peekSandboxRootForConversation(
  conversationId: string | undefined,
): string | undefined {
  const cid = conversationId?.trim()
  if (!cid) return undefined
  return registry.get(cid)?.layout.root
}

/** Stable sandbox directory for a conversation (in-memory or on disk). */
export function resolveSandboxRootForConversation(
  conversationId: string,
): string {
  const cid = conversationId.trim()
  return peekSandboxRootForConversation(cid) ?? stableRootForConversation(cid)
}

function stableRootForConversation(conversationId: string): string {
  const dirName = createHash('sha256')
    .update(conversationId, 'utf8')
    .digest('hex')
  return join(getopenfdeSandboxDir(), dirName)
}

/**
 * Returns an existing sandbox for the conversation, or creates one under a stable
 * path. Always refreshes skill assets for the current skill id.
 */
export async function getOrCreateSandboxForConversation(
  conversationId: string | undefined,
  skillId?: string,
): Promise<SandboxPlanningAccess> {
  if (!conversationId?.trim()) {
    const sb = new Sandbox()
    await sb.copySkillAssets(skillId)
    return sb
  }

  const cid = conversationId.trim()
  let sb = registry.get(cid)
  if (!sb) {
    sb = new Sandbox({ root: stableRootForConversation(cid) })
    registry.set(cid, sb)
  }
  await sb.copySkillAssets(skillId)
  return sb
}

/** Drop registry entry and delete the sandbox directory (e.g. when the chat is deleted). */
export async function releaseConversationSandbox(
  conversationId: string,
): Promise<void> {
  const cid = conversationId.trim()
  const sb = registry.get(cid)
  if (!sb) return
  registry.delete(cid)
  await sb.cleanup()
}
