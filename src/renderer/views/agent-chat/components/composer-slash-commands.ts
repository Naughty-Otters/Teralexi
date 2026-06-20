import { formatAgentSwitchHelp } from '@shared/agent/agent-switch-command'
import { formatSkillSwitchHelp } from '@shared/agent/skill-switch-command'
import { formatSubAgentSlashHelp } from '@shared/agent/sub-agent-slash-command'
import type { SubAgentTarget } from '@shared/agent/sub-agent-targets'
import { formatWorkspaceSlashHelp } from '@shared/agent/workspace-slash-command'

export type ComposerSlashCommand = {
  /** Command token without leading slash (e.g. `compact`). */
  name: string
  label: string
  description: string
  icon: string
}

/** Available in any agent conversation. */
export const UNIVERSAL_SLASH_COMMANDS: readonly ComposerSlashCommand[] = [
  {
    name: 'compact',
    label: '/compact',
    description: 'Summarize older messages and free context',
    icon: 'i-lucide-shrink',
  },
  {
    name: 'help',
    label: '/help',
    description: 'Show available slash commands',
    icon: 'i-lucide-circle-help',
  },
  {
    name: 'workspace',
    label: '/workspace',
    description: 'Show, set, pick, or clear the project workspace folder',
    icon: 'i-lucide-folder',
  },
  {
    name: 'agent',
    label: '/agent',
    description: 'Show, pick, or switch the active agent',
    icon: 'i-lucide-bot',
  },
]

/** Shown when sub-agent delegation is enabled for the active agent. */
export const SUB_AGENT_SLASH_COMMAND: ComposerSlashCommand = {
  name: 'sub-agent',
  label: '/sub-agent',
  description: 'Delegate directly to a sub-agent (@slug task)',
  icon: 'i-lucide-users',
}

/** Explore + YOLO modes for every skill/agent. */
export const UNIVERSAL_MODE_SLASH_COMMANDS: readonly ComposerSlashCommand[] = [
  {
    name: 'explore',
    label: '/explore',
    description: 'Enter exploring mode (read-only); /explore clear to reset',
    icon: 'i-lucide-telescope',
  },
  {
    name: 'yolo',
    label: '/yolo',
    description: 'Toggle YOLO mode (skip tool approvals)',
    icon: 'i-lucide-zap',
  },
]

/** Coding agent only (auto, MCP, extensibility). Explore coding mode is toggled via the mode bar. */
export const CODING_ONLY_SLASH_COMMANDS: readonly ComposerSlashCommand[] = [
  {
    name: 'auto',
    label: '/auto',
    description: 'Toggle auto mode (auto-approve, no clarifying questions)',
    icon: 'i-lucide-bot',
  },
  {
    name: 'mcp',
    label: '/mcp',
    description: 'List MCP servers or add stdio server',
    icon: 'i-lucide-plug',
  },
]

export function slashCommandsForAgent(
  codingAgent: boolean,
  subAgentsEnabled = false,
): ComposerSlashCommand[] {
  const universal = [
    ...UNIVERSAL_SLASH_COMMANDS,
    ...(subAgentsEnabled ? [SUB_AGENT_SLASH_COMMAND] : []),
    ...UNIVERSAL_MODE_SLASH_COMMANDS,
  ]
  return codingAgent
    ? [...universal, ...CODING_ONLY_SLASH_COMMANDS]
    : universal
}

export function filterSlashCommands(
  query: string,
  codingAgent = false,
  subAgentsEnabled = false,
): ComposerSlashCommand[] {
  const q = query.trim().toLowerCase()
  const pool = slashCommandsForAgent(codingAgent, subAgentsEnabled)
  if (!q) return pool
  return pool.filter(
    (cmd) => cmd.name.startsWith(q) || cmd.label.slice(1).startsWith(q),
  )
}

export function formatSlashHelp(
  codingAgent = false,
  enabledAgents: Array<{
    id: string
    skillId?: string | null
    name: string
    enabled?: boolean
  }> = [],
  subAgentTargets: readonly SubAgentTarget[] = [],
): string {
  const subAgentsEnabled = subAgentTargets.length > 0
  const commandLines = slashCommandsForAgent(codingAgent, subAgentsEnabled)
    .map((cmd) => `${cmd.label} — ${cmd.description}`)
    .join('\n')
  return [
    commandLines,
    formatAgentSwitchHelp(enabledAgents),
    formatSkillSwitchHelp(enabledAgents),
    subAgentsEnabled ? formatSubAgentSlashHelp(subAgentTargets) : '',
    formatWorkspaceSlashHelp(),
  ]
    .filter(Boolean)
    .join('\n')
}

/** @deprecated Use slashCommandsForAgent */
export const COMPOSER_SLASH_COMMANDS = [
  ...UNIVERSAL_SLASH_COMMANDS,
  ...UNIVERSAL_MODE_SLASH_COMMANDS,
  ...CODING_ONLY_SLASH_COMMANDS,
] as const
