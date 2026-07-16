import type Database from 'better-sqlite3'
import {
  DEFAULT_CODING_MODE,
  parseCodingMode,
  type CodingMode,
} from '@shared/agent/coding-mode'
import {
  EMPTY_CONVERSATION_HOOKS,
  parseConversationHooksConfig,
  serializeConversationHooksConfig,
  type ConversationHooksConfig,
} from '@shared/agent/conversation-hooks'
import {
  parseConversationLlmOverride,
  parseConversationLlmOverrideJson,
  serializeConversationLlmOverride,
  type ConversationLlmOverride,
} from '@shared/agent/conversation-llm-override'
import {
  DEFAULT_AGENT_PLAN_MODE_STATE,
  parseAgentPlanModeState,
  serializeAgentPlanModeState,
  type AgentPlanModeState,
} from '@shared/agent/plan-mode'
import type { StoredConversationSettings } from './types'

function parseSessionApprovedToolsJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map((v) => String(v).trim()).filter(Boolean))]
  } catch {
    return []
  }
}

function parseCodingModeJson(raw: string | null | undefined): CodingMode {
  if (!raw?.trim()) return DEFAULT_CODING_MODE
  try {
    const parsed = JSON.parse(raw) as unknown
    return parseCodingMode(
      typeof parsed === 'string' ? parsed : String(parsed ?? ''),
    )
  } catch {
    return parseCodingMode(raw)
  }
}

function parsePlanModeStateJson(raw: string | null | undefined): AgentPlanModeState {
  if (!raw?.trim()) return { ...DEFAULT_AGENT_PLAN_MODE_STATE }
  try {
    return parseAgentPlanModeState(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_AGENT_PLAN_MODE_STATE }
  }
}

function parseHooksJson(raw: string | null | undefined): ConversationHooksConfig {
  if (!raw?.trim()) return { ...EMPTY_CONVERSATION_HOOKS, hooks: [] }
  try {
    return parseConversationHooksConfig(JSON.parse(raw))
  } catch {
    return { ...EMPTY_CONVERSATION_HOOKS, hooks: [] }
  }
}

function rowToSettings(row: {
  conversation_id: string
  workspace_path: string | null
  session_approved_tools_json: string | null
  coding_mode_json: string | null
  plan_mode_json: string | null
  hooks_json: string | null
  llm_override_json: string | null
  updated_at: string
}): StoredConversationSettings {
  return {
    conversationId: row.conversation_id,
    workspacePath: row.workspace_path,
    sessionApprovedTools: parseSessionApprovedToolsJson(
      row.session_approved_tools_json,
    ),
    codingMode: parseCodingModeJson(row.coding_mode_json),
    planModeState: parsePlanModeStateJson(row.plan_mode_json),
    hooks: parseHooksJson(row.hooks_json),
    llmOverride: parseConversationLlmOverrideJson(row.llm_override_json),
    updatedAt: row.updated_at,
  }
}

const SELECT_COLS = `conversation_id, workspace_path, session_approved_tools_json, coding_mode_json, plan_mode_json, hooks_json, llm_override_json, updated_at`

type SettingsRow = {
  conversation_id: string
  workspace_path: string | null
  session_approved_tools_json: string | null
  coding_mode_json: string | null
  plan_mode_json: string | null
  hooks_json: string | null
  llm_override_json: string | null
  updated_at: string
}

type UpsertArgs = {
  conversationId: string
  workspacePath: string | null
  sessionApprovedTools: string[]
  codingMode: CodingMode
  planModeState: AgentPlanModeState
  hooks: ConversationHooksConfig
  llmOverride: ConversationLlmOverride | null
}

export class ConversationSettingsRepository {
  constructor(private readonly db: Database.Database) {}

  get(conversationId: string): StoredConversationSettings | null {
    const row = this.db
      .prepare(
        `SELECT ${SELECT_COLS}
         FROM conversation_settings
         WHERE conversation_id = ?`,
      )
      .get(conversationId) as SettingsRow | undefined

    if (!row) return null
    return rowToSettings(row)
  }

  private upsertRow(args: UpsertArgs): StoredConversationSettings {
    const now = new Date().toISOString()
    const hooks = parseConversationHooksConfig(args.hooks)
    const llmOverride = parseConversationLlmOverride(args.llmOverride)
    this.db
      .prepare(
        `INSERT INTO conversation_settings (conversation_id, workspace_path, session_approved_tools_json, coding_mode_json, plan_mode_json, hooks_json, llm_override_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(conversation_id) DO UPDATE SET
           workspace_path = excluded.workspace_path,
           session_approved_tools_json = excluded.session_approved_tools_json,
           coding_mode_json = excluded.coding_mode_json,
           plan_mode_json = excluded.plan_mode_json,
           hooks_json = excluded.hooks_json,
           llm_override_json = excluded.llm_override_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        args.conversationId,
        args.workspacePath,
        JSON.stringify(args.sessionApprovedTools),
        JSON.stringify(args.codingMode),
        serializeAgentPlanModeState(args.planModeState),
        serializeConversationHooksConfig(hooks),
        serializeConversationLlmOverride(llmOverride),
        now,
      )
    return {
      conversationId: args.conversationId,
      workspacePath: args.workspacePath,
      sessionApprovedTools: args.sessionApprovedTools,
      codingMode: args.codingMode,
      planModeState: args.planModeState,
      hooks,
      llmOverride,
      updatedAt: now,
    }
  }

  private mergeExisting(conversationId: string): UpsertArgs {
    const existing = this.get(conversationId)
    return {
      conversationId,
      workspacePath: existing?.workspacePath ?? null,
      sessionApprovedTools: existing?.sessionApprovedTools ?? [],
      codingMode: existing?.codingMode ?? DEFAULT_CODING_MODE,
      planModeState: existing?.planModeState ?? { ...DEFAULT_AGENT_PLAN_MODE_STATE },
      hooks: existing?.hooks ?? { hooks: [] },
      llmOverride: existing?.llmOverride ?? null,
    }
  }

  setWorkspacePath(
    conversationId: string,
    workspacePath: string | null,
  ): StoredConversationSettings {
    const base = this.mergeExisting(conversationId)
    return this.upsertRow({ ...base, workspacePath })
  }

  setCodingMode(
    conversationId: string,
    codingMode: CodingMode,
  ): StoredConversationSettings {
    const base = this.mergeExisting(conversationId)
    return this.upsertRow({
      ...base,
      codingMode: parseCodingMode(codingMode),
    })
  }

  getCodingMode(conversationId: string): CodingMode {
    return this.get(conversationId)?.codingMode ?? DEFAULT_CODING_MODE
  }

  getPlanModeState(conversationId: string): AgentPlanModeState {
    return (
      this.get(conversationId)?.planModeState ?? { ...DEFAULT_AGENT_PLAN_MODE_STATE }
    )
  }

  setPlanModeState(
    conversationId: string,
    planModeState: AgentPlanModeState,
  ): StoredConversationSettings {
    const base = this.mergeExisting(conversationId)
    return this.upsertRow({
      ...base,
      planModeState: parseAgentPlanModeState(planModeState),
    })
  }

  getHooks(conversationId: string): ConversationHooksConfig {
    return this.get(conversationId)?.hooks ?? { hooks: [] }
  }

  setHooks(
    conversationId: string,
    hooks: ConversationHooksConfig,
  ): StoredConversationSettings {
    const base = this.mergeExisting(conversationId)
    return this.upsertRow({
      ...base,
      hooks: parseConversationHooksConfig(hooks),
    })
  }

  getLlmOverride(conversationId: string): ConversationLlmOverride | null {
    return this.get(conversationId)?.llmOverride ?? null
  }

  setLlmOverride(
    conversationId: string,
    llmOverride: ConversationLlmOverride | null,
  ): StoredConversationSettings {
    const base = this.mergeExisting(conversationId)
    return this.upsertRow({
      ...base,
      llmOverride: parseConversationLlmOverride(llmOverride),
    })
  }

  getSessionApprovedTools(conversationId: string): string[] {
    return this.get(conversationId)?.sessionApprovedTools ?? []
  }

  addSessionApprovedTool(conversationId: string, toolName: string): string[] {
    const normalized = toolName.trim()
    if (!normalized) return this.getSessionApprovedTools(conversationId)

    const base = this.mergeExisting(conversationId)
    const merged = [...new Set([...base.sessionApprovedTools, normalized])]
    this.upsertRow({ ...base, sessionApprovedTools: merged })
    return merged
  }

  copySessionApprovedTools(
    sourceConversationId: string,
    targetConversationId: string,
  ): void {
    const source = this.get(sourceConversationId)
    if (!source?.sessionApprovedTools.length) return
    const target = this.get(targetConversationId)
    this.upsertRow({
      conversationId: targetConversationId,
      workspacePath: target?.workspacePath ?? source.workspacePath,
      sessionApprovedTools: source.sessionApprovedTools,
      codingMode: target?.codingMode ?? source.codingMode,
      planModeState: target?.planModeState ?? source.planModeState,
      hooks: target?.hooks ?? source.hooks,
      llmOverride: target?.llmOverride ?? source.llmOverride,
    })
  }

  clear(conversationId: string): void {
    this.setWorkspacePath(conversationId, null)
  }
}
