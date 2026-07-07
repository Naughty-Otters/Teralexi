import { formatAgentSwitchHelp } from '@shared/agent/agent-switch-command'
import { formatSkillSwitchHelp } from '@shared/agent/skill-switch-command'
import { formatSubAgentSlashHelp } from '@shared/agent/sub-agent-slash-command'
import type { SubAgentTarget } from '@shared/agent/sub-agent-targets'
import { formatWorkspaceSlashHelp } from '@shared/agent/workspace-slash-command'
import {
  CODING_ONLY_SLASH_COMMANDS,
  COMPOSER_SLASH_COMMANDS,
  filterSlashCommands,
  slashCommandsForAgent,
  SUB_AGENT_SLASH_COMMAND,
  UNIVERSAL_MODE_SLASH_COMMANDS,
  UNIVERSAL_SLASH_COMMANDS,
} from './composer-slash-command-list'

export type { ComposerSlashCommand } from './composer-slash-command-types'
export {
  CODING_ONLY_SLASH_COMMANDS,
  COMPOSER_SLASH_COMMANDS,
  filterSlashCommands,
  slashCommandsForAgent,
  SUB_AGENT_SLASH_COMMAND,
  UNIVERSAL_MODE_SLASH_COMMANDS,
  UNIVERSAL_SLASH_COMMANDS,
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
