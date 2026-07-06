import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  getWorkflowSandboxDir,
  getWorkflowSourceDir,
} from '@config/teralexi-home'
import {
  DEFINITION_JSON_FILENAME,
  ENTITIES_DEFINITION_JSON_FILENAME,
  ENTITIES_MD_FILENAME,
  WORKFLOW_DEFINITION_JSON_FILENAME,
  WORKFLOW_MD_FILENAME,
  type WorkflowDefinitionSource,
} from '@shared/workflows/source-files'
import { compileWorkflowSources } from '@shared/workflows/compile-workflow-sources'
import {
  parseWorkflowDefinitionJson,
  serializeEntitiesDefinition,
  serializeWorkflowDefinitionBody,
} from '@shared/workflows/definition-serialization'
import { getConversationStore } from '@main/services/conversation-store'
import type {
  StoredWorkflow,
  StoredWorkflowDeployment,
  StoredWorkflowVersion,
} from '@main/services/conversation-store/types'
import {
  parseWorkflowDefinition,
  WORKFLOW_DEFINITION_VERSION,
  type WorkflowDefinition,
} from '@shared/workflows/schema'
import { WORKFLOW_RUNTIME_AGENT_ID } from '@shared/skills/workflow-panel-skills'
import { workflowDefinitionToMermaid } from '@shared/workflows/mermaid'
import { randomShortUuid } from '@shared/utils/short-uuid'

export function defaultBlankWorkflowDefinitionSource(args: {
  name: string
  workflowId: string
  description?: string
}): WorkflowDefinitionSource {
  const body = buildBlankWorkflowDefinition({
    id: args.workflowId,
    name: args.name,
    description: args.description,
  })
  return {
    workflowDefinitionJson: serializeWorkflowDefinitionBody(body),
    entitiesDefinitionJson: serializeEntitiesDefinition([]),
  }
}

/** @deprecated Use {@link defaultBlankWorkflowDefinitionSource} */
export function defaultBlankWorkflowSourceFiles(args: {
  name: string
  workflowId: string
}): WorkflowDefinitionSource {
  return defaultBlankWorkflowDefinitionSource(args)
}

function readLegacyMarkdownPartial(workflowId: string): {
  workflowMd: string
  entitiesMd: string
} {
  try {
    const dir = getWorkflowSourceDir(workflowId)
    let workflowMd = ''
    let entitiesMd = ''
    try {
      workflowMd = readFileSync(join(dir, WORKFLOW_MD_FILENAME), 'utf-8')
    } catch {
      /* legacy workflow.md missing */
    }
    try {
      entitiesMd = readFileSync(join(dir, ENTITIES_MD_FILENAME), 'utf-8')
    } catch {
      /* legacy entities.md missing */
    }
    return { workflowMd, entitiesMd }
  } catch {
    return { workflowMd: '', entitiesMd: '' }
  }
}

function splitDefinitionToSourceFiles(
  definition: WorkflowDefinition,
): WorkflowDefinitionSource {
  const { entities, ...body } = definition
  return {
    workflowDefinitionJson: serializeWorkflowDefinitionBody({
      ...body,
      id: definition.id,
      name: definition.name,
    }),
    entitiesDefinitionJson: serializeEntitiesDefinition(entities ?? []),
  }
}

function readLegacyDefinitionJsonPartial(workflowId: string): string {
  try {
    return readFileSync(
      join(getWorkflowSourceDir(workflowId), DEFINITION_JSON_FILENAME),
      'utf-8',
    )
  } catch {
    return ''
  }
}

function sourceFilesFromVersion(
  version: StoredWorkflowVersion | null | undefined,
): WorkflowDefinitionSource | null {
  if (!version) return null
  if (version.definitionJson?.trim()) {
    return splitDefinitionToSourceFiles(
      parseWorkflowDefinition(JSON.parse(version.definitionJson)),
    )
  }
  if (!version.compilerMetadataJson?.trim()) return null
  try {
    const meta = JSON.parse(version.compilerMetadataJson) as {
      workflowDefinitionJson?: string
      entitiesDefinitionJson?: string
      definitionJson?: string
      workflowMd?: string
      entitiesMd?: string
    }
    if (meta.workflowDefinitionJson?.trim()) {
      return {
        workflowDefinitionJson: meta.workflowDefinitionJson,
        entitiesDefinitionJson: meta.entitiesDefinitionJson ?? serializeEntitiesDefinition([]),
      }
    }
    if (meta.definitionJson?.trim()) {
      return splitDefinitionToSourceFiles(parseWorkflowDefinitionJson(meta.definitionJson))
    }
    if (meta.workflowMd?.trim()) {
      const compiled = compileWorkflowSources({
        workflowMd: meta.workflowMd,
        entitiesMd: meta.entitiesMd ?? '',
        seed: { id: version.workflowId, name: 'Workflow' },
      })
      if (compiled.workflowErrors.length > 0) return null
      return splitDefinitionToSourceFiles(compiled.definition)
    }
  } catch {
    return null
  }
  return null
}

function migrateLegacyMarkdownToSourceFiles(args: {
  workflowId: string
  name: string
  description?: string
}): WorkflowDefinitionSource | null {
  const legacy = readLegacyMarkdownPartial(args.workflowId)
  if (!legacy.workflowMd.trim()) return null
  const compiled = compileWorkflowSources({
    workflowMd: legacy.workflowMd,
    entitiesMd: legacy.entitiesMd,
    seed: {
      id: args.workflowId,
      name: args.name,
      description: args.description,
    },
  })
  if (compiled.workflowErrors.length > 0 || compiled.entityErrors.length > 0) {
    return null
  }
  return splitDefinitionToSourceFiles({
    ...compiled.definition,
    id: args.workflowId,
    name: args.name,
    description: compiled.definition.description ?? args.description,
    status: 'draft' as const,
    version: WORKFLOW_DEFINITION_VERSION,
    executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
  })
}

function writeWorkflowSourceFiles(
  workflowId: string,
  source: WorkflowDefinitionSource,
): void {
  const dir = getWorkflowSourceDir(workflowId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, WORKFLOW_DEFINITION_JSON_FILENAME),
    source.workflowDefinitionJson,
    'utf-8',
  )
  writeFileSync(
    join(dir, ENTITIES_DEFINITION_JSON_FILENAME),
    source.entitiesDefinitionJson,
    'utf-8',
  )
}

/** Keep disk sources in sync; migrate legacy definition.json / markdown once. */
export function syncWorkflowSourceFiles(args: {
  workflowId: string
  name: string
  description?: string
  version?: StoredWorkflowVersion | null
}): WorkflowDefinitionSource {
  mkdirSync(getWorkflowSourceDir(args.workflowId), { recursive: true })

  const current = readWorkflowDefinitionSourcePartial(args.workflowId)
  if (current.workflowDefinitionJson.trim()) {
    if (!current.entitiesDefinitionJson.trim()) {
      const patched = {
        ...current,
        entitiesDefinitionJson: serializeEntitiesDefinition([]),
      }
      writeWorkflowSourceFiles(args.workflowId, patched)
      return patched
    }
    return current
  }

  const legacyDefinition = readLegacyDefinitionJsonPartial(args.workflowId)
  if (legacyDefinition.trim()) {
    const split = splitDefinitionToSourceFiles(
      parseWorkflowDefinitionJson(legacyDefinition),
    )
    writeWorkflowSourceFiles(args.workflowId, split)
    return split
  }

  const seeded =
    sourceFilesFromVersion(args.version) ??
    migrateLegacyMarkdownToSourceFiles(args) ??
    defaultBlankWorkflowDefinitionSource(args)

  writeWorkflowSourceFiles(args.workflowId, seeded)
  return seeded
}

export function loadWorkflowDefinitionFromVersion(
  version: StoredWorkflowVersion,
): WorkflowDefinition {
  return parseWorkflowDefinition(JSON.parse(version.definitionJson))
}

export function loadWorkflowDefinitionByVersionId(
  versionId: string,
): WorkflowDefinition | null {
  const version = getConversationStore().getWorkflowVersion(versionId)
  if (!version) return null
  return loadWorkflowDefinitionFromVersion(version)
}

export function persistWorkflowSandboxArtifact(
  workflowId: string,
  runId: string,
  fileName: string,
  content: string,
): string {
  const dir = getWorkflowSandboxDir(workflowId, runId)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, fileName)
  writeFileSync(path, content, 'utf-8')
  return path
}

export function persistWorkflowDefinitionSource(
  workflowId: string,
  source: WorkflowDefinitionSource,
): void {
  writeWorkflowSourceFiles(workflowId, source)
}

/** @deprecated Use {@link persistWorkflowDefinitionSource} */
export function persistWorkflowSourceFiles(
  workflowId: string,
  files: WorkflowDefinitionSource,
): void {
  persistWorkflowDefinitionSource(workflowId, files)
}

export function readWorkflowDefinitionSourcePartial(
  workflowId: string,
): WorkflowDefinitionSource {
  try {
    const dir = getWorkflowSourceDir(workflowId)
    let workflowDefinitionJson = ''
    let entitiesDefinitionJson = ''
    try {
      workflowDefinitionJson = readFileSync(
        join(dir, WORKFLOW_DEFINITION_JSON_FILENAME),
        'utf-8',
      )
    } catch {
      /* missing workflow_definition.json */
    }
    try {
      entitiesDefinitionJson = readFileSync(
        join(dir, ENTITIES_DEFINITION_JSON_FILENAME),
        'utf-8',
      )
    } catch {
      /* missing entities_definition.json */
    }
    return { workflowDefinitionJson, entitiesDefinitionJson }
  } catch {
    return { workflowDefinitionJson: '', entitiesDefinitionJson: '' }
  }
}

/** @deprecated Use {@link readWorkflowDefinitionSourcePartial} */
export function readWorkflowSourceFilesPartial(
  workflowId: string,
): WorkflowDefinitionSource {
  return readWorkflowDefinitionSourcePartial(workflowId)
}

export function readWorkflowDefinitionSource(
  workflowId: string,
): WorkflowDefinitionSource | null {
  const source = readWorkflowDefinitionSourcePartial(workflowId)
  if (!source.workflowDefinitionJson.trim()) return null
  return source
}

/** @deprecated Use {@link readWorkflowDefinitionSource} */
export function readWorkflowSourceFiles(
  workflowId: string,
): WorkflowDefinitionSource | null {
  return readWorkflowDefinitionSource(workflowId)
}

export function readWorkflowSandboxArtifact(
  workflowId: string,
  runId: string,
  fileName: string,
): string | null {
  try {
    return readFileSync(
      join(getWorkflowSandboxDir(workflowId, runId), fileName),
      'utf-8',
    )
  } catch {
    return null
  }
}

export function createDraftWorkflow(args: {
  userId: string
  id?: string
  name: string
  description?: string
}): StoredWorkflow {
  const now = new Date().toISOString()
  return getConversationStore().upsertWorkflow({
    id: args.id ?? `wf-${randomShortUuid()}`,
    userId: args.userId,
    name: args.name,
    description: args.description ?? '',
    status: 'draft',
    currentVersionId: null,
    createdAt: now,
  })
}

export function saveWorkflowVersion(args: {
  workflowId: string
  definition: WorkflowDefinition
  mermaid: string
  summaryMarkdown: string
  compilerMetadata?: Record<string, unknown>
}): StoredWorkflowVersion {
  const store = getConversationStore()
  const versionNumber = store.nextWorkflowVersionNumber(args.workflowId)
  const version = store.insertWorkflowVersion({
    id: `wfv-${randomShortUuid()}`,
    workflowId: args.workflowId,
    versionNumber,
    definitionJson: JSON.stringify(args.definition),
    mermaid: args.mermaid,
    summaryMarkdown: args.summaryMarkdown,
    compilerMetadataJson: JSON.stringify(args.compilerMetadata ?? {}),
  })

  const existing = store.getWorkflow(args.workflowId)
  if (existing) {
    store.upsertWorkflow({
      ...existing,
      currentVersionId: version.id,
      status: args.definition.status,
    })
  }

  return version
}

export function buildBlankWorkflowDefinition(args: {
  id: string
  name: string
  description?: string
}): WorkflowDefinition {
  return {
    version: WORKFLOW_DEFINITION_VERSION,
    id: args.id,
    name: args.name,
    description: args.description,
    status: 'draft',
    executor: { agentId: WORKFLOW_RUNTIME_AGENT_ID },
    triggers: [{ type: 'manual' }],
    steps: [
      {
        id: 'step_1',
        type: 'task',
        title: 'First step',
        expression: {
          title: 'First step',
          prompt: 'Add workflow steps or compile from a prompt.',
        },
      },
    ],
  }
}

/** Create a workflow record only — no DSL version until the Define chat compiles one. */
export function createWorkflow(args: {
  userId: string
  name: string
  description?: string
}): { workflowId: string } {
  const trimmedName = args.name.trim()
  if (!trimmedName) {
    throw new Error('Workflow name is required')
  }

  const workflow = createDraftWorkflow({
    userId: args.userId,
    name: trimmedName,
    description: args.description?.trim(),
  })

  syncWorkflowSourceFiles({
    workflowId: workflow.id,
    name: workflow.name,
  })

  return { workflowId: workflow.id }
}

/** @deprecated Use createWorkflow — kept for call-site migration. */
export function createBlankWorkflowDraft(args: {
  userId: string
  name: string
  description?: string
}): { workflowId: string } {
  return createWorkflow(args)
}

export type WorkflowStoreSnapshot = {
  workflow: StoredWorkflow
  versions: StoredWorkflowVersion[]
  deployments: StoredWorkflowDeployment[]
  sourceFiles: WorkflowDefinitionSource
}

export function getWorkflowSnapshot(
  workflowId: string,
): WorkflowStoreSnapshot | null {
  const store = getConversationStore()
  const workflow = store.getWorkflow(workflowId)
  if (!workflow) return null
  const versions = store.listWorkflowVersions(workflowId)
  const sourceFiles = syncWorkflowSourceFiles({
    workflowId,
    name: workflow.name,
    description: workflow.description || undefined,
    version: versions[0] ?? null,
  })
  return {
    workflow,
    versions,
    deployments: store.listWorkflowDeployments(workflowId),
    sourceFiles,
  }
}
