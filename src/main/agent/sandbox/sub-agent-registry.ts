/**
 * Isolated sandbox roots for sub-agent runs:
 *   ~/.openfde/workspace/sandbox/sub-agents/sub-agent-<agent>-<suffix>/
 */

import { join } from 'node:path'
import { getopenfdeSandboxDir } from '@config/openfde-home'
import { Sandbox } from './sandbox-impl'
import type { SandboxPlanningAccess } from './types'

export type SubAgentSandboxRecord = {
  conversationId?: string
  rootRunId?: string
  parentRunId: string
  agentId: string
  runId: string
  sandboxRoot: string
  startedAt: string
}

const sandboxByRunId = new Map<string, Sandbox>()
const recordsByRunId = new Map<string, SubAgentSandboxRecord>()
const runIdsByConversation = new Map<string, Set<string>>()

/** Filesystem-safe segment from a catalog agent id. */
export function sanitizeAgentIdForSandboxPath(agentId: string): string {
  return agentId.trim().replace(/[^a-zA-Z0-9._-]+/g, '_')
}

export function resolveSubAgentSandboxRoot(_agentId: string, runId: string): string {
  const safeRunId = runId.trim().replace(/[^a-zA-Z0-9._-]+/g, '_')
  if (!safeRunId) {
    throw new Error('Sub-agent sandbox requires a non-empty runId')
  }
  return join(getopenfdeSandboxDir(), 'sub-agents', safeRunId)
}

export function isSubAgentSandboxRoot(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return normalized.includes('/sandbox/sub-agents/')
}

export async function getOrCreateSandboxForSubAgentRun(args: {
  agentId: string
  runId: string
  skillId?: string
  conversationId?: string
  rootRunId?: string
  parentRunId: string
}): Promise<SandboxPlanningAccess> {
  const { agentId, runId, skillId, conversationId, rootRunId, parentRunId } =
    args
  const trimmedRunId = runId.trim()
  const trimmedAgentId = agentId.trim()
  if (!trimmedRunId || !trimmedAgentId) {
    throw new Error('Sub-agent sandbox requires agentId and runId')
  }

  let sb = sandboxByRunId.get(trimmedRunId)
  const root = resolveSubAgentSandboxRoot(trimmedAgentId, trimmedRunId)

  if (!sb) {
    sb = new Sandbox({ root })
    sandboxByRunId.set(trimmedRunId, sb)
    const record: SubAgentSandboxRecord = {
      conversationId: conversationId?.trim() || undefined,
      rootRunId: rootRunId?.trim() || undefined,
      parentRunId: parentRunId.trim(),
      agentId: trimmedAgentId,
      runId: trimmedRunId,
      sandboxRoot: root,
      startedAt: new Date().toISOString(),
    }
    recordsByRunId.set(trimmedRunId, record)
    const cid = conversationId?.trim()
    if (cid) {
      const set = runIdsByConversation.get(cid) ?? new Set<string>()
      set.add(trimmedRunId)
      runIdsByConversation.set(cid, set)
    }
  }

  await sb.init()
  await sb.copySkillAssets(skillId)
  return sb
}

export function getSubAgentSandboxRecord(
  runId: string,
): SubAgentSandboxRecord | undefined {
  return recordsByRunId.get(runId.trim())
}

export function listSubAgentSandboxRootsForConversation(
  conversationId: string,
): string[] {
  const cid = conversationId.trim()
  const runIds = runIdsByConversation.get(cid)
  if (!runIds?.size) return []
  return [...runIds]
    .map((id) => recordsByRunId.get(id)?.sandboxRoot)
    .filter((p): p is string => Boolean(p?.trim()))
}

export async function releaseSubAgentSandbox(runId: string): Promise<void> {
  const trimmed = runId.trim()
  const sb = sandboxByRunId.get(trimmed)
  const record = recordsByRunId.get(trimmed)
  if (record?.conversationId) {
    const set = runIdsByConversation.get(record.conversationId)
    set?.delete(trimmed)
    if (set?.size === 0) runIdsByConversation.delete(record.conversationId)
  }
  sandboxByRunId.delete(trimmed)
  recordsByRunId.delete(trimmed)
  if (sb) await sb.cleanup()
}

export async function releaseSubAgentSandboxesForConversation(
  conversationId: string,
): Promise<string[]> {
  const cid = conversationId.trim()
  const runIds = [...(runIdsByConversation.get(cid) ?? [])]
  const roots: string[] = []
  for (const runId of runIds) {
    const record = recordsByRunId.get(runId)
    if (record?.sandboxRoot) roots.push(record.sandboxRoot)
    await releaseSubAgentSandbox(runId)
  }
  return roots
}

/** @internal Test helper */
export function clearSubAgentSandboxRegistryForTests(): void {
  sandboxByRunId.clear()
  recordsByRunId.clear()
  runIdsByConversation.clear()
}
