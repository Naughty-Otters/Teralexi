import type Database from 'better-sqlite3'
import {
  DEFAULT_CODING_MODE,
  parseCodingMode,
  type CodingMode,
} from '@shared/agent/coding-mode'
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

function rowToSettings(row: {
  conversation_id: string
  workspace_path: string | null
  session_approved_tools_json: string | null
  coding_mode_json: string | null
  plan_mode_json: string | null
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
    updatedAt: row.updated_at,
  }
}

const SELECT_COLS = `conversation_id, workspace_path, session_approved_tools_json, coding_mode_json, plan_mode_json, updated_at`

type UpsertArgs = {
  conversationId: string
  workspacePath: string | null
  sessionApprovedTools: string[]
  codingMode: CodingMode
  planModeState: AgentPlanModeState
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
      .get(conversationId) as
      | {
          conversation_id: string
          workspace_path: string | null
          session_approved_tools_json: string | null
          coding_mode_json: string | null
          plan_mode_json: string | null
          updated_at: string
        }
      | undefined

    if (!row) return null
    return rowToSettings(row)
  }

  private upsertRow(args: UpsertArgs): StoredConversationSettings {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO conversation_settings (conversation_id, workspace_path, session_approved_tools_json, coding_mode_json, plan_mode_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(conversation_id) DO UPDATE SET
           workspace_path = excluded.workspace_path,
           session_approved_tools_json = excluded.session_approved_tools_json,
           coding_mode_json = excluded.coding_mode_json,
           plan_mode_json = excluded.plan_mode_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        args.conversationId,
        args.workspacePath,
        JSON.stringify(args.sessionApprovedTools),
        JSON.stringify(args.codingMode),
        serializeAgentPlanModeState(args.planModeState),
        now,
      )
    return {
      conversationId: args.conversationId,
      workspacePath: args.workspacePath,
      sessionApprovedTools: args.sessionApprovedTools,
      codingMode: args.codingMode,
      planModeState: args.planModeState,
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
    })
  }

  clear(conversationId: string): void {
    this.setWorkspacePath(conversationId, null)
  }
}
