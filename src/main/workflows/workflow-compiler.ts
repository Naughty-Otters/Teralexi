import { readFileSync } from 'fs'
import { join } from 'path'
import { jsonrepair } from 'jsonrepair'
import { getTeralexiWorkflowsDir } from '@config/teralexi-home'
import { getConversationStore } from '@main/services/conversation-store'
import type { StoredWorkflowVersion } from '@main/services/conversation-store/types'
import { createLogger } from '@main/logger'
import { loadSkillCompileSettings } from '@main/skills/skill-compile-settings'
import { resolveSkillCompileLlm } from '@shared/agent/skill-compile-settings'
import type { SkillCompileProvider } from '@shared/agent/skill-compile-settings'
import {
  parseWorkflowDefinition,
  safeParseWorkflowDefinition,
  WORKFLOW_DEFINITION_VERSION,
  type WorkflowDefinition,
} from '@shared/workflows/schema'
import { normalizeWorkflowDefinitionRaw } from '@shared/workflows/normalize-workflow-definition'
import { workflowDefinitionToMermaid } from '@shared/workflows/mermaid'
import { compileWorkflowWithTools } from './workflow-compiler-run'
import { WORKFLOW_COMPILER_TOOL_NAMES } from './workflow-source-scope'
import {
  loadWorkflowDefinitionByVersionId,
  persistWorkflowDefinitionSource,
  readWorkflowDefinitionSource,
  saveWorkflowVersion,
  syncWorkflowSourceFiles,
} from './workflow-store'
import {
  definitionDiffSummary,
  validateWorkflowDefinition,
} from './workflow-validator'
import {
  loadWorkflowCompilerSystemPrompt,
} from './workflow-skills'
import { WORKFLOW_RUNTIME_AGENT_ID } from '@shared/skills/workflow-panel-skills'
import { WORKFLOW_COMPILER_SKILL_ID } from '@main/skills/skill-visibility'
import {
  mergeWorkflowSourceJson,
  serializeEntitiesDefinition,
  serializeWorkflowDefinition,
  serializeWorkflowDefinitionBody,
} from '@shared/workflows/definition-serialization'
import { compileWorkflowSources } from '@shared/workflows/compile-workflow-sources'

const log = createLogger('workflows.compiler')

let cachedCompilerSystemPrompt: string | null = null

async function resolveCompilerSystemPrompt(): Promise<string> {
  if (!cachedCompilerSystemPrompt) {
    cachedCompilerSystemPrompt = await loadWorkflowCompilerSystemPrompt()
  }
  return cachedCompilerSystemPrompt
}

export { resolveCompilerSystemPrompt }

export type WorkflowCompileRequest = {
  userId: string
  workflowId: string
  prompt?: string
  uploadMarkdown?: string
  uploadPath?: string
  toolCatalog?: string[]
  baseVersionId?: string
}

export type WorkflowCompileResponse = {
  workflowId: string
  versionId: string
  definition: WorkflowDefinition
  mermaid: string
  summaryMarkdown: string
  diffLines: string[]
  validationErrors: string[]
  validationWarnings: string[]
  definitionJson: string
  sourceErrors: {
    definition: string[]
    mermaid: string | null
  }
}

const WORKFLOW_COMPILE_SKILL_ID = WORKFLOW_COMPILER_SKILL_ID

const DEFAULT_WORKFLOW_COMPILE_LLM = {
  provider: 'ollama' as SkillCompileProvider,
  model: 'gemma4',
}

function resolveWorkflowCompileLlm() {
  const compileSettings = loadSkillCompileSettings()
  return resolveSkillCompileLlm(
    WORKFLOW_COMPILE_SKILL_ID,
    DEFAULT_WORKFLOW_COMPILE_LLM,
    compileSettings,
  )
}

export { resolveWorkflowCompileLlm }

function parseUploadedWorkflowMarkdown(markdown: string): Partial<WorkflowDefinition> {
  const idMatch = markdown.match(/^id:\s*(.+)$/m)
  const nameMatch = markdown.match(/^name:\s*(.+)$/m)
  const yamlBlock = markdown.match(/```(?:yaml|json)?\s*([\s\S]*?)```/)
  if (yamlBlock?.[1]) {
    try {
      return JSON.parse(jsonrepair(yamlBlock[1].trim())) as Partial<WorkflowDefinition>
    } catch {
      // fall through
    }
  }
  return {
    id: idMatch?.[1]?.trim(),
    name: nameMatch?.[1]?.trim() ?? 'Imported workflow',
  }
}

function buildSummaryMarkdown(definition: WorkflowDefinition): string {
  const triggerLines = (definition.triggers ?? [])
    .map((t) => `- **${t.type}**`)
    .join('\n')
  const stepLines = definition.steps
    .map((s) => `- **${s.id}** (${s.type})${'title' in s && s.title ? `: ${s.title}` : ''}`)
    .join('\n')
  const entityLines = (definition.entities ?? [])
    .map((e) => `- **${e.name}** (${e.id}) — ${e.fields.length} field(s)`)
    .join('\n')
  return `# ${definition.name}

${definition.description ?? 'No description'}

## Triggers
${triggerLines || '- manual'}

## Steps
${stepLines}

## Business entities
${entityLines || '- none'}
`
}

async function compileWithLlm(args: {
  workflowId: string
  workflowName: string
  userId: string
  prompt: string
  seed?: Partial<WorkflowDefinition>
  knownTools?: Set<string>
  seedVersion?: StoredWorkflowVersion | null
}): Promise<{ assistantText: string }> {
  const compileLlm = resolveWorkflowCompileLlm()

  log.info(
    {
      compileProvider: compileLlm.provider,
      compileModel: compileLlm.model,
      compileLlmSource: compileLlm.source,
    },
    'workflow compile agent: request start',
  )

  const system = await resolveCompilerSystemPrompt()

  return compileWorkflowWithTools({
    workflowId: args.workflowId,
    workflowName: args.workflowName,
    userId: args.userId,
    systemPrompt: system,
    userPrompt: [
      args.seed?.name ? `Suggested name: ${args.seed.name}` : '',
      args.seed?.id ? `Suggested id: ${args.seed.id}` : '',
      'Allowed tools:',
      WORKFLOW_COMPILER_TOOL_NAMES.join(', '),
      '',
      args.prompt,
    ]
      .filter(Boolean)
      .join('\n'),
    provider: compileLlm.provider,
    model: compileLlm.model,
    knownTools: args.knownTools,
    seedVersion: args.seedVersion,
  })
}

export type FinalizeWorkflowFromSourcesArgs = {
  userId: string
  workflowId: string
  baseVersionId?: string
  prompt?: string
  assistantText?: string
  toolCatalog?: string[]
}

export async function finalizeWorkflowFromSources(
  args: FinalizeWorkflowFromSourcesArgs,
): Promise<WorkflowCompileResponse> {
  const store = getConversationStore()
  const workflow = store.getWorkflow(args.workflowId)
  if (!workflow || workflow.userId !== args.userId) {
    throw new Error('Workflow not found')
  }

  const toolCatalog = args.toolCatalog ?? [...WORKFLOW_COMPILER_TOOL_NAMES]
  const workflowId = args.workflowId

  const previousDefinition = args.baseVersionId
    ? loadWorkflowDefinitionByVersionId(args.baseVersionId)
    : workflow.currentVersionId
      ? loadWorkflowDefinitionByVersionId(workflow.currentVersionId)
      : null

  const source = readWorkflowDefinitionSource(workflowId)
  if (!source?.workflowDefinitionJson.trim()) {
    throw new Error(
      args.assistantText?.trim()
        ? `Compiler finished but workflow_definition.json is empty. Agent said: ${args.assistantText.trim()}`
        : 'Compiler did not update workflow_definition.json',
    )
  }

  const merged = mergeWorkflowSourceJson(
    source.workflowDefinitionJson,
    source.entitiesDefinitionJson,
  )
  if (!merged.success) {
    throw new Error(merged.errors.join('; '))
  }

  let definition: WorkflowDefinition = {
    ...merged.data,
    id: workflowId,
    name: workflow.name,
    description: merged.data.description ?? workflow.description ?? undefined,
    status: 'draft' as const,
    version: WORKFLOW_DEFINITION_VERSION,
    executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
  }

  const validation = validateWorkflowDefinition(definition, {
    knownTools: new Set(toolCatalog),
  })
  const mermaid = workflowDefinitionToMermaid(definition)
  const summaryMarkdown = buildSummaryMarkdown(definition)
  const diffLines = definitionDiffSummary(previousDefinition, definition)

  const sourceErrors = {
    definition: validation.errors,
    mermaid: null as string | null,
  }

  const validationErrors = [...validation.errors]
  const mergedDefinitionJson = serializeWorkflowDefinition(definition).trimEnd()

  const version = saveWorkflowVersion({
    workflowId,
    definition,
    mermaid,
    summaryMarkdown,
    compilerMetadata: {
      prompt: args.prompt,
      compiledAt: new Date().toISOString(),
      workflowDefinitionJson: source.workflowDefinitionJson,
      entitiesDefinitionJson: source.entitiesDefinitionJson,
      definitionJson: mergedDefinitionJson,
      sourceErrors,
    },
  })

  return {
    workflowId,
    versionId: version.id,
    definition,
    mermaid,
    summaryMarkdown,
    diffLines,
    validationErrors,
    validationWarnings: validation.warnings,
    definitionJson: mergedDefinitionJson,
    sourceErrors,
  }
}

export async function compileWorkflow(
  request: WorkflowCompileRequest,
): Promise<WorkflowCompileResponse> {
  if (!request.workflowId?.trim()) {
    throw new Error('workflowId is required — create a workflow first, then compile DSL in Define chat')
  }

  const store = getConversationStore()
  const workflow = store.getWorkflow(request.workflowId)
  if (!workflow || workflow.userId !== request.userId) {
    throw new Error('Workflow not found')
  }

  const toolCatalog = request.toolCatalog ?? [...WORKFLOW_COMPILER_TOOL_NAMES]

  let seed: Partial<WorkflowDefinition> = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description || undefined,
  }
  if (request.uploadMarkdown?.trim()) {
    seed = { ...seed, ...parseUploadedWorkflowMarkdown(request.uploadMarkdown) }
  } else if (request.uploadPath?.trim()) {
    try {
      const raw = readFileSync(
        join(getTeralexiWorkflowsDir(), request.uploadPath),
        'utf-8',
      )
      seed = { ...seed, ...parseUploadedWorkflowMarkdown(raw) }
    } catch (err) {
      log.warn('Failed to read upload path', { path: request.uploadPath, err })
    }
  }

  const prompt =
    request.prompt?.trim() ??
    (request.uploadMarkdown?.trim()
      ? `Convert this workflow markdown into a WorkflowDefinition JSON:\n\n${request.uploadMarkdown}`
      : '')

  if (!prompt) {
    throw new Error('prompt or uploadMarkdown is required')
  }

  const workflowId = request.workflowId
  const versions = store.listWorkflowVersions(workflowId)

  syncWorkflowSourceFiles({
    workflowId,
    name: workflow.name,
    version: versions[0] ?? null,
  })

  if (request.uploadMarkdown?.trim()) {
    const compiled = compileWorkflowSources({
      workflowMd: request.uploadMarkdown,
      entitiesMd: '',
      seed: {
        id: workflowId,
        name: workflow.name,
        description: workflow.description || undefined,
      },
    })
    const uploaded = {
      ...compiled.definition,
      id: workflowId,
      name: workflow.name,
      status: 'draft' as const,
      version: WORKFLOW_DEFINITION_VERSION,
      executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
    }
    const { entities, ...body } = uploaded
    persistWorkflowDefinitionSource(workflowId, {
      workflowDefinitionJson: serializeWorkflowDefinitionBody(body),
      entitiesDefinitionJson: serializeEntitiesDefinition(entities ?? []),
    })
  }

  const compileResult = await compileWithLlm({
    workflowId,
    workflowName: workflow.name,
    userId: request.userId,
    prompt,
    seed,
    knownTools: new Set(toolCatalog),
    seedVersion: versions[0] ?? null,
  })

  return finalizeWorkflowFromSources({
    userId: request.userId,
    workflowId,
    baseVersionId: request.baseVersionId,
    prompt,
    assistantText: compileResult.assistantText,
    toolCatalog,
  })
}

export function confirmWorkflowVersion(args: {
  userId: string
  workflowId: string
  versionId: string
}): WorkflowDefinition {
  const store = getConversationStore()
  const workflow = store.getWorkflow(args.workflowId)
  if (!workflow || workflow.userId !== args.userId) {
    throw new Error('Workflow not found')
  }

  const existingVersion = store.getWorkflowVersion(args.versionId)
  if (!existingVersion || existingVersion.workflowId !== args.workflowId) {
    throw new Error('Workflow version not found')
  }

  const parsed = safeParseWorkflowDefinition(JSON.parse(existingVersion.definitionJson))
  if (!parsed.success) {
    throw new Error(parsed.error)
  }

  const validation = validateWorkflowDefinition(parsed.data)
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join('; '))
  }

  const confirmed: WorkflowDefinition = {
    ...parsed.data,
    status: 'confirmed',
  }

  const savedVersion = saveWorkflowVersion({
    workflowId: args.workflowId,
    definition: confirmed,
    mermaid: existingVersion.mermaid,
    summaryMarkdown: existingVersion.summaryMarkdown,
    compilerMetadata: { confirmedAt: new Date().toISOString() },
  })

  store.upsertWorkflow({
    ...workflow,
    status: 'confirmed',
    currentVersionId: savedVersion.id,
  })

  return confirmed
}

export type SaveWorkflowDefinitionRequest = {
  userId: string
  workflowId: string
  definitionJson: string
  baseVersionId?: string
}

export type SaveWorkflowDefinitionResponse = {
  workflowId: string
  versionId: string
  definition: WorkflowDefinition
  mermaid: string
  validationErrors: string[]
  validationWarnings: string[]
}

export async function saveWorkflowDefinitionFromJson(
  request: SaveWorkflowDefinitionRequest,
): Promise<SaveWorkflowDefinitionResponse> {
  if (!request.workflowId?.trim()) {
    throw new Error('workflowId is required')
  }

  const store = getConversationStore()
  const workflow = store.getWorkflow(request.workflowId)
  if (!workflow || workflow.userId !== request.userId) {
    throw new Error('Workflow not found')
  }

  let raw: unknown
  try {
    raw = JSON.parse(jsonrepair(request.definitionJson.trim()))
  } catch (err) {
    throw new Error(
      err instanceof Error ? `Invalid JSON: ${err.message}` : 'Invalid JSON',
    )
  }

  const normalized = normalizeWorkflowDefinitionRaw(raw)
  const parsed = safeParseWorkflowDefinition(normalized)
  if (!parsed.success) {
    throw new Error(parsed.error)
  }

  const previousDefinition = request.baseVersionId
    ? loadWorkflowDefinitionByVersionId(request.baseVersionId)
    : workflow.currentVersionId
      ? loadWorkflowDefinitionByVersionId(workflow.currentVersionId)
      : null

  const definition: WorkflowDefinition = {
    ...parsed.data,
    id: workflow.id,
    name: workflow.name,
    description: parsed.data.description ?? workflow.description ?? undefined,
    status: 'draft',
    version: WORKFLOW_DEFINITION_VERSION,
    executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
  }

  const validation = validateWorkflowDefinition(definition)
  const mermaid = workflowDefinitionToMermaid(definition)
  const summaryMarkdown = buildSummaryMarkdown(definition)

  const version = saveWorkflowVersion({
    workflowId: request.workflowId,
    definition,
    mermaid,
    summaryMarkdown,
    compilerMetadata: {
      editedAt: new Date().toISOString(),
      source: 'json-editor',
      previousVersionId: request.baseVersionId ?? workflow.currentVersionId,
      diffLines: definitionDiffSummary(previousDefinition, definition),
    },
  })

  const { entities, ...body } = definition
  persistWorkflowDefinitionSource(request.workflowId, {
    workflowDefinitionJson: serializeWorkflowDefinitionBody(body),
    entitiesDefinitionJson: serializeEntitiesDefinition(entities ?? []),
  })

  return {
    workflowId: request.workflowId,
    versionId: version.id,
    definition,
    mermaid,
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
  }
}

export function parseWorkflowUploadContent(content: string): WorkflowDefinition | null {
  try {
    const fromJson = JSON.parse(jsonrepair(content.trim()))
    const parsed = safeParseWorkflowDefinition(
      normalizeWorkflowDefinitionRaw(fromJson),
    )
    return parsed.success ? parsed.data : null
  } catch {
    const seed = parseUploadedWorkflowMarkdown(content)
    if (seed.id && seed.steps) {
      const full = safeParseWorkflowDefinition(seed)
      return full.success ? full.data : null
    }
    return null
  }
}
