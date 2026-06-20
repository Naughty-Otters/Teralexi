import {
  parseSubagentProfileType,
  type SubagentProfileType,
} from '@shared/agent/coding-mode'

export type SubagentProfile = {
  type: SubagentProfileType
  label: string
  description: string
  /** Catalog agent id to invoke (coding skill by default). */
  agentId: string
  allowedTools: string[] | 'all'
  taskPrefix: string
}

const EXPLORE_TOOLS = [
  'read_file',
  'grep_files',
  'glob_files',
  'list_files',
  'search_files',
  'file_status',
  'lsp',
  'git_status',
  'git_diff',
  'git_log',
]

const ARCHITECT_TOOLS = [...EXPLORE_TOOLS, 'read_todos', 'update_todos']

export const SUBAGENT_PROFILES: Record<SubagentProfileType, SubagentProfile> = {
  explore: {
    type: 'explore',
    label: 'Explore',
    description: 'Read-only codebase exploration and mapping.',
    agentId: 'skill:coding',
    allowedTools: EXPLORE_TOOLS,
    taskPrefix: 'Explore the codebase (read-only). ',
  },
  architect: {
    type: 'architect',
    label: 'Plan',
    description: 'Read-only analysis that produces an implementation plan.',
    agentId: 'skill:coding',
    allowedTools: ARCHITECT_TOOLS,
    taskPrefix: 'Produce a detailed implementation plan (no file writes). ',
  },
  coder: {
    type: 'coder',
    label: 'Coder',
    description: 'Full coding workflow: edit, verify, git.',
    agentId: 'skill:coding',
    allowedTools: 'all',
    taskPrefix: 'Implement and verify the following task. ',
  },
}

export function resolveSubagentProfile(
  type: string,
): SubagentProfile | null {
  const key = parseSubagentProfileType(type)
  if (!key) return null
  return SUBAGENT_PROFILES[key] ?? null
}
