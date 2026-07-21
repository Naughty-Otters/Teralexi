import type { StepOutputs } from '../types'
import type { SubAgentRunStatus } from '../types'

/**
 * Cap parent-facing subagent summaries. Kept large enough for research reports
 * so the parent does not re-invoke thinking the answer was truncated mid-stream.
 */
export const SUB_AGENT_BRIEF_SUMMARY_MAX_CHARS = 32_000

const SUMMARY_TRUNCATION_NOTICE =
  '\n\n[Summary capped for the parent tool result. The full report is in the sub-agent bubble — do not re-invoke to get more text.]'

export type SubAgentBrief = {
  status: SubAgentRunStatus
  summary: string
  filesTouched: string[]
  openQuestions: string[]
  runId: string
  agentId: string
  agentName: string
  error?: string
  worktreePath?: string
  worktreeBranch?: string
  /** How the isolated worktree was resolved after the run. */
  worktreeOutcome?: 'merged' | 'discarded'
}

export function mergeSubFlowOutputText(
  stepOutputs: StepOutputs,
  merge: 'report' | 'summary' | 'all' = 'report',
): string {
  if (merge === 'summary' && stepOutputs.summary?.summary?.trim()) {
    return stepOutputs.summary.summary.trim()
  }
  if (merge === 'report' && stepOutputs.report?.trim()) {
    return stepOutputs.report.trim()
  }
  const parts: string[] = []
  if (stepOutputs.report?.trim()) parts.push(stepOutputs.report.trim())
  if (stepOutputs.summary?.summary?.trim()) {
    parts.push(stepOutputs.summary.summary.trim())
  }
  if (stepOutputs.toolLoop?.trim()) parts.push(stepOutputs.toolLoop.trim())
  return parts.join('\n\n') || 'Sub-agent completed with no report output.'
}

function truncateSummary(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= SUB_AGENT_BRIEF_SUMMARY_MAX_CHARS) return trimmed
  const budget = SUB_AGENT_BRIEF_SUMMARY_MAX_CHARS - SUMMARY_TRUNCATION_NOTICE.length
  return `${trimmed.slice(0, Math.max(0, budget))}${SUMMARY_TRUNCATION_NOTICE}`
}

/** Prefer report/summary stages; fall back to truncated toolLoop assistant text. */
export function resolveSubAgentSummaryText(stepOutputs?: StepOutputs): string {
  if (!stepOutputs) return 'Sub-agent completed with no summary.'
  if (stepOutputs.report?.trim()) return truncateSummary(stepOutputs.report)
  if (stepOutputs.summary?.summary?.trim()) {
    return truncateSummary(stepOutputs.summary.summary)
  }
  if (stepOutputs.toolLoop?.trim()) {
    return truncateSummary(stepOutputs.toolLoop)
  }
  return 'Sub-agent completed with no summary.'
}

/** Best-effort path list from `git diff --stat` output. */
export function parseFilesTouchedFromDiffStat(
  diffStat: string | undefined,
): string[] {
  if (!diffStat?.trim()) return []
  const files: string[] = []
  for (const line of diffStat.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(' ')) continue
    if (/^\d+ files? changed/.test(trimmed)) continue
    const pipe = trimmed.indexOf('|')
    if (pipe <= 0) continue
    const path = trimmed.slice(0, pipe).trim()
    if (path && !path.includes('=>')) files.push(path)
  }
  return [...new Set(files)].slice(0, 40)
}

export function buildSubAgentBrief(args: {
  runId: string
  agentId: string
  agentName: string
  status: SubAgentRunStatus
  stepOutputs?: StepOutputs
  error?: string
  worktreePath?: string
  worktreeBranch?: string
  worktreeDiffStat?: string
  worktreeOutcome?: 'merged' | 'discarded'
}): SubAgentBrief {
  return {
    status: args.status,
    summary: args.error?.trim()
      ? truncateSummary(args.error)
      : resolveSubAgentSummaryText(args.stepOutputs),
    filesTouched: parseFilesTouchedFromDiffStat(args.worktreeDiffStat),
    openQuestions: [],
    runId: args.runId,
    agentId: args.agentId,
    agentName: args.agentName,
    error: args.error,
    worktreePath: args.worktreePath,
    worktreeBranch: args.worktreeBranch,
    worktreeOutcome: args.worktreeOutcome,
  }
}
