import type Database from 'better-sqlite3'
import {
  parseStageLlmDocument,
  serializeStageLlmDocument,
  type AgentLlmRoutingMode,
} from '@shared/agent/stage-llm-settings'
import {
  normalizeToolApprovalOverrides,
  parseJsonStringArray,
  parseJsonStringArrayOrNull,
  parseJsonToolApprovalOverrides,
} from './json-helpers'
import type { StoredAgentConfiguration } from './types'

type AgentConfigurationRow = {
  agent_id: string
  user_id: string
  name: string
  description: string
  model: string
  provider: StoredAgentConfiguration['provider']
  color: StoredAgentConfiguration['color']
  enabled: number
  system_prompt: string
  skills_prompt: string
  available_set_json: string
  available_set_touched: number
  tool_needs_approval_overrides_json: string
  available_mcp_servers_json: string
  tool_loop_max_iterations: number
  todo_max_retries: number
  allow_as_sub_agent: number
  allow_sub_agents: number
  sub_agent_ids_json: string
  llm_routing_mode: AgentLlmRoutingMode
  stage_llm_json: string
  created_at: string
  updated_at: string
}

function mapRow(row: AgentConfigurationRow): StoredAgentConfiguration {
  const stageDoc = parseStageLlmDocument(row.stage_llm_json)
  return {
    agentId: row.agent_id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    model: row.model,
    provider: row.provider,
    color: row.color,
    enabled: row.enabled !== 0,
    systemPrompt: row.system_prompt,
    skillsPrompt: row.skills_prompt,
    availableSet: parseJsonStringArray(row.available_set_json),
    availableSetTouched: row.available_set_touched !== 0,
    toolNeedsApprovalOverrides: parseJsonToolApprovalOverrides(
      row.tool_needs_approval_overrides_json,
    ),
    availableMcpServers: parseJsonStringArrayOrNull(
      row.available_mcp_servers_json,
    ),
    toolLoopMaxIterations: row.tool_loop_max_iterations,
    todoMaxRetries: row.todo_max_retries,
    allowAsSubAgent: row.allow_as_sub_agent !== 0,
    allowSubAgents: row.allow_sub_agents !== 0,
    subAgentIds: parseJsonStringArrayOrNull(row.sub_agent_ids_json),
    llmRoutingMode:
      row.llm_routing_mode === 'per_stage' ? 'per_stage' : 'unified',
    stageLlm: stageDoc.stages,
    ...(stageDoc.defaultProviderOptions
      ? { defaultProviderOptions: stageDoc.defaultProviderOptions }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT_COLUMNS = `
  agent_id,
  user_id,
  name,
  description,
  model,
  provider,
  color,
  enabled,
  system_prompt,
  skills_prompt,
  available_set_json,
  available_set_touched,
  tool_needs_approval_overrides_json,
  available_mcp_servers_json,
  tool_loop_max_iterations,
  todo_max_retries,
  allow_as_sub_agent,
  allow_sub_agents,
  sub_agent_ids_json,
  llm_routing_mode,
  stage_llm_json,
  created_at,
  updated_at
`

export class AgentConfigurationsRepository {
  constructor(private readonly db: Database.Database) {}

  list(userId: string): StoredAgentConfiguration[] {
    const rows = this.db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM agent_configurations
         WHERE user_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(userId) as AgentConfigurationRow[]

    return rows.map(mapRow)
  }

  upsert(
    config: Omit<StoredAgentConfiguration, 'createdAt' | 'updatedAt'>,
  ): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO agent_configurations (
          agent_id,
          user_id,
          name,
          description,
          model,
          provider,
          color,
          enabled,
          system_prompt,
          skills_prompt,
          available_set_json,
          available_set_touched,
          tool_needs_approval_overrides_json,
          available_mcp_servers_json,
          tool_loop_max_iterations,
          todo_max_retries,
          allow_as_sub_agent,
          allow_sub_agents,
          sub_agent_ids_json,
          llm_routing_mode,
          stage_llm_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_id, user_id)
        DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          model = excluded.model,
          provider = excluded.provider,
          color = excluded.color,
          enabled = excluded.enabled,
          system_prompt = excluded.system_prompt,
          skills_prompt = excluded.skills_prompt,
          available_set_json = excluded.available_set_json,
          available_set_touched = excluded.available_set_touched,
          tool_needs_approval_overrides_json = excluded.tool_needs_approval_overrides_json,
          available_mcp_servers_json = excluded.available_mcp_servers_json,
          tool_loop_max_iterations = excluded.tool_loop_max_iterations,
          todo_max_retries = excluded.todo_max_retries,
          allow_as_sub_agent = excluded.allow_as_sub_agent,
          allow_sub_agents = excluded.allow_sub_agents,
          sub_agent_ids_json = excluded.sub_agent_ids_json,
          llm_routing_mode = excluded.llm_routing_mode,
          stage_llm_json = excluded.stage_llm_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        config.agentId,
        config.userId,
        config.name,
        config.description,
        config.model,
        config.provider,
        config.color,
        config.enabled ? 1 : 0,
        config.systemPrompt,
        config.skillsPrompt,
        JSON.stringify([...new Set(config.availableSet ?? [])]),
        config.availableSetTouched ? 1 : 0,
        JSON.stringify(
          normalizeToolApprovalOverrides(config.toolNeedsApprovalOverrides),
        ),
        config.availableMcpServers != null
          ? JSON.stringify([...new Set(config.availableMcpServers)])
          : 'null',
        config.toolLoopMaxIterations,
        config.todoMaxRetries,
        config.allowAsSubAgent ? 1 : 0,
        config.allowSubAgents ? 1 : 0,
        config.subAgentIds != null
          ? JSON.stringify([...new Set(config.subAgentIds)])
          : 'null',
        config.llmRoutingMode === 'per_stage' ? 'per_stage' : 'unified',
        serializeStageLlmDocument({
          defaultProviderOptions: config.defaultProviderOptions,
          stages: config.stageLlm,
        }),
        now,
        now,
      )
  }

  delete(agentId: string, userId: string): void {
    this.db
      .prepare(
        'DELETE FROM agent_configurations WHERE agent_id = ? AND user_id = ?',
      )
      .run(agentId, userId)
  }
}
