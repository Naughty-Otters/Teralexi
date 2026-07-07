import type { ComposerSlashCommand } from './composer-slash-command-types'

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
  description: 'Delegate directly to a sub-agent (slug + task)',
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

/** @deprecated Use slashCommandsForAgent */
export const COMPOSER_SLASH_COMMANDS = [
  ...UNIVERSAL_SLASH_COMMANDS,
  ...UNIVERSAL_MODE_SLASH_COMMANDS,
  ...CODING_ONLY_SLASH_COMMANDS,
] as const
