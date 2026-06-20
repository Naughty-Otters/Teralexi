import { WORKFLOW_RUNTIME_AGENT_ID } from '@shared/skills/workflow-panel-skills'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

const DEFAULT_DAILY_CRON = '0 9 * * *'

function normalizeExecutor(raw: unknown): { agentId: string } {
  const agentId = isRecord(raw) ? firstString(raw.agentId) : undefined
  if (!agentId) {
    return { agentId: WORKFLOW_RUNTIME_AGENT_ID }
  }
  if (agentId === 'skill:default' || agentId === 'default') {
    return { agentId: WORKFLOW_RUNTIME_AGENT_ID }
  }
  return { agentId }
}

function normalizeTrigger(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) {
    return { type: 'manual' }
  }

  let type = firstString(raw.type)?.toLowerCase() ?? 'manual'
  if (type === 'daily' || type === 'cron' || type === 'everyday') {
    type = 'schedule'
  }

  if (type === 'manual') {
    return { type: 'manual' }
  }

  if (type === 'schedule') {
    const cron = firstString(
      raw.cron,
      raw.cronExpression,
      raw.cron_expression,
      raw.expression,
      raw.schedule,
    )
    return {
      type: 'schedule',
      cron: cron ?? DEFAULT_DAILY_CRON,
      ...(firstString(raw.timezone) ? { timezone: firstString(raw.timezone) } : {}),
    }
  }

  if (type === 'channel_message') {
    return {
      type: 'channel_message',
      channelId: firstString(raw.channelId, raw.channel) ?? 'slack',
      match: firstString(raw.match, raw.pattern, raw.text) ?? '.*',
    }
  }

  if (type === 'channel_form') {
    const formId = firstString(raw.formId, raw.form)
    if (!formId) {
      return { type: 'manual' }
    }
    return {
      type: 'channel_form',
      formId,
      ...(firstString(raw.channelId, raw.channel)
        ? { channelId: firstString(raw.channelId, raw.channel) }
        : {}),
    }
  }

  if (type === 'webhook') {
    const path = firstString(raw.path, raw.url)
    if (!path) {
      return { type: 'manual' }
    }
    return { type: 'webhook', path }
  }

  return { type: 'manual' }
}

function normalizeToolMock(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) {
    return null
  }
  const tool = firstString(raw.tool, raw.toolName, raw.tool_name, raw.name)
  if (!tool) {
    return null
  }
  return {
    tool,
    ...(raw.fixture !== undefined ? { fixture: raw.fixture } : {}),
    ...(isRecord(raw.inputMatch) ? { inputMatch: raw.inputMatch } : {}),
  }
}

function normalizeHttpMock(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) {
    return null
  }
  const match = firstString(raw.match, raw.url, raw.path)
  if (!match) {
    return null
  }
  const response = isRecord(raw.response)
    ? raw.response
    : raw.body !== undefined
      ? { body: raw.body }
      : undefined

  return {
    match,
    ...(firstString(raw.method) ? { method: firstString(raw.method) } : {}),
    ...(response ? { response } : {}),
  }
}

function normalizeMocks(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw)) {
    return undefined
  }

  const http = Array.isArray(raw.http)
    ? raw.http
        .map(normalizeHttpMock)
        .filter((entry): entry is Record<string, unknown> => entry != null)
    : []
  const tools = Array.isArray(raw.tools)
    ? raw.tools
        .map(normalizeToolMock)
        .filter((entry): entry is Record<string, unknown> => entry != null)
    : []

  if (http.length === 0 && tools.length === 0) {
    return undefined
  }

  return {
    ...(http.length > 0 ? { http } : {}),
    ...(tools.length > 0 ? { tools } : {}),
  }
}

function normalizeEntityFieldSource(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) {
    return { kind: 'user_input' }
  }

  const kind = firstString(raw.kind) ?? 'user_input'
  if (kind === 'tool') {
    const tool = firstString(raw.tool, raw.toolName, raw.tool_name, raw.name)
    if (!tool) {
      return { kind: 'user_input' }
    }
    return {
      kind: 'tool',
      tool,
      ...(firstString(raw.stepId) ? { stepId: firstString(raw.stepId) } : {}),
      ...(firstString(raw.resultPath) ? { resultPath: firstString(raw.resultPath) } : {}),
    }
  }

  return {
    kind: 'user_input',
    ...(firstString(raw.formStepId) ? { formStepId: firstString(raw.formStepId) } : {}),
    ...(firstString(raw.inputKey) ? { inputKey: firstString(raw.inputKey) } : {}),
  }
}

function normalizeEntityField(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) {
    return null
  }
  const key = firstString(raw.key)
  const type = firstString(raw.type)
  if (!key || !type) {
    return null
  }

  return {
    key,
    type,
    ...(firstString(raw.label) ? { label: firstString(raw.label) } : {}),
    ...(typeof raw.required === 'boolean' ? { required: raw.required } : {}),
    ...(firstString(raw.description) ? { description: firstString(raw.description) } : {}),
    source: normalizeEntityFieldSource(raw.source),
    ...(Array.isArray(raw.options) ? { options: raw.options } : {}),
  }
}

function normalizeEntity(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = firstString(raw.id)
  const name = firstString(raw.name)
  if (!id || !name) {
    return null
  }

  const fields = Array.isArray(raw.fields)
    ? raw.fields
        .map(normalizeEntityField)
        .filter((field): field is Record<string, unknown> => field != null)
    : []

  if (fields.length === 0) {
    return null
  }

  return {
    id,
    name,
    ...(firstString(raw.description) ? { description: firstString(raw.description) } : {}),
    fields,
  }
}

/** Repair common LLM/compiler JSON shapes before strict schema validation. */
export function normalizeWorkflowDefinitionRaw(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return raw
  }

  const normalized: Record<string, unknown> = { ...raw }

  if (Array.isArray(raw.triggers)) {
    normalized.triggers = raw.triggers.map(normalizeTrigger)
  } else {
    normalized.triggers = [{ type: 'manual' }]
  }

  if (raw.mocks !== undefined) {
    normalized.mocks = normalizeMocks(raw.mocks)
  }

  if (Array.isArray(raw.entities)) {
    normalized.entities = raw.entities
      .map(normalizeEntity)
      .filter((entity): entity is Record<string, unknown> => entity != null)
  }

  normalized.executor = normalizeExecutor(raw.executor)

  return normalized
}
