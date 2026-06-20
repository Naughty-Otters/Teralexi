import { randomBytes } from 'node:crypto'
import type { FlowStageId } from '../constants/step-ids'
import type { AgentResponseOpts, AgentStepId } from '../types'
import { getCurrentAgentRunScope } from './run-scope'

/**
 * Separator between run scope and local stage / step identifiers.
 * Use `::` so root run ids may include `conversationId:assistantMessageId` safely.
 */
export const SCOPED_ID_SEP = '::' as const

/** Length of generated run / step instance suffix ids (hex). */
export const SHORT_RUN_ID_LENGTH = 8

/** Compact id for child runs and step instances (default 8 hex chars). */
export function randomShortId(length = SHORT_RUN_ID_LENGTH): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length)
}

function agentSlugForSubAgentRunId(agentId: string | undefined): string {
  const slug = (agentId ?? 'run')
    .trim()
    .replace(/^skill:/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 24)
  return slug || 'run'
}

/** Unique sub-agent run id used for sandbox dirs, UI events, and scoped step keys. */
export function createSubAgentRunId(agentId?: string): string {
  return `sub-agent-${agentSlugForSubAgentRunId(agentId)}-${randomShortId()}`
}

export type ParsedScopedId = {
  flowId?: string
  /** Stage id or step instance suffix (may contain additional `:` segments). */
  local: string
}

export function parseScopedId(scoped: string): ParsedScopedId {
  const i = scoped.indexOf(SCOPED_ID_SEP)
  if (i < 0) return { local: scoped }
  return {
    flowId: scoped.slice(0, i),
    local: scoped.slice(i + SCOPED_ID_SEP.length),
  }
}

export function formatScopedStageId(flowId: string, stageId: FlowStageId): string {
  return `${flowId}${SCOPED_ID_SEP}${stageId}`
}

export function formatScopedStepKey(flowId: string, localKey: string): string {
  return `${flowId}${SCOPED_ID_SEP}${localKey}`
}

/** `flowId:stepId:instanceSuffix` for a new step instance in the current run. */
export function formatScopedStepInstanceKey(
  flowId: string,
  stepId: AgentStepId,
  instanceSuffix: string,
): string {
  return formatScopedStepKey(flowId, `${stepId}:${instanceSuffix}`)
}

export function currentFlowIdFromScope(): string | undefined {
  return getCurrentAgentRunScope()?.runId
}

/**
 * Stable id for the root run of an assistant turn so HITL resume matches scoped stage ids.
 */
export function stableRootRunId(opts: AgentResponseOpts): string {
  const conversationId = opts.conversationId?.trim()
  const assistantMessageId = opts.assistantMessageId?.trim()
  if (conversationId && assistantMessageId) {
    return `${conversationId}:${assistantMessageId}`
  }
  return randomShortId()
}

/** Unwrap a scoped stage id for pipeline entry lookup in the active run. */
export function stageIdForPipelineLookup(
  stageIdOrScoped: string,
  currentFlowId?: string,
): FlowStageId | undefined {
  const { flowId, local } = parseScopedId(stageIdOrScoped)
  if (flowId && currentFlowId && flowId !== currentFlowId) {
    return undefined
  }
  return local as FlowStageId
}

/** Logical tool-loop scope after removing flow id (`toolLoop:<instance>`). */
export function toolLoopSandboxScopeFromStepKey(stepKeyOrScope: string): string {
  const trimmed = stepKeyOrScope.trim()
  if (!trimmed) return trimmed
  return parseScopedId(trimmed).local || trimmed
}

/**
 * Sandbox-relative path segments for a step key (`toolLoop/<instance>`),
 * never `flowId::toolLoop:…` or colon-separated ids.
 */
export function toolLoopFilesystemScopeFromStepKey(stepKeyOrScope: string): string {
  const local = toolLoopSandboxScopeFromStepKey(stepKeyOrScope)
  if (!local) return local
  return local.split(':').filter(Boolean).join('/')
}

export function ensureScopedStepKey(flowId: string, key: string): string {
  const { flowId: prefix } = parseScopedId(key)
  if (prefix === flowId) return key
  if (prefix && prefix !== flowId) return key
  return formatScopedStepKey(flowId, key)
}
