import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  readWorkflowDefinitionSource,
  readWorkflowDefinitionSourcePartial,
  syncWorkflowSourceFiles,
  buildBlankWorkflowDefinition,
} from './workflow-store'
import {
  ENTITIES_DEFINITION_JSON_FILENAME,
  serializeEntitiesDefinition,
  serializeWorkflowDefinitionBody,
  WORKFLOW_DEFINITION_JSON_FILENAME,
} from '@shared/workflows/source-files'

let testWorkflowsRoot = ''

vi.mock('@config/openfde-home', () => ({
  getWorkflowSourceDir: (workflowId: string) => join(testWorkflowsRoot, workflowId, 'source'),
  getopenfdeWorkflowsDir: () => testWorkflowsRoot,
}))

function blankSourceFiles(workflowId: string, name: string) {
  const definition = buildBlankWorkflowDefinition({ id: workflowId, name })
  const { entities, ...body } = definition
  return {
    workflowDefinitionJson: serializeWorkflowDefinitionBody(body),
    entitiesDefinitionJson: serializeEntitiesDefinition(entities ?? []),
  }
}

describe('workflow definition source sync', () => {
  const workflowId = 'wf-sync-test'

  beforeEach(async () => {
    testWorkflowsRoot = await mkdtemp(join(tmpdir(), 'openfde-wf-sync-'))
  })

  afterEach(async () => {
    await rm(testWorkflowsRoot, { recursive: true, force: true })
  })

  it('reads split source files when present', async () => {
    const sourceDir = join(testWorkflowsRoot, workflowId, 'source')
    await mkdir(sourceDir, { recursive: true })
    const files = blankSourceFiles(workflowId, 'Saved')
    await writeFile(
      join(sourceDir, WORKFLOW_DEFINITION_JSON_FILENAME),
      files.workflowDefinitionJson,
      'utf-8',
    )
    await writeFile(
      join(sourceDir, ENTITIES_DEFINITION_JSON_FILENAME),
      files.entitiesDefinitionJson,
      'utf-8',
    )

    const partial = readWorkflowDefinitionSourcePartial(workflowId)
    expect(JSON.parse(partial.workflowDefinitionJson).name).toBe('Saved')

    const loaded = readWorkflowDefinitionSource(workflowId)
    expect(loaded?.workflowDefinitionJson).toContain('"name": "Saved"')
  })

  it('seeds split files from version definitionJson', async () => {
    const definition = buildBlankWorkflowDefinition({
      id: workflowId,
      name: 'From version',
    })
    const files = syncWorkflowSourceFiles({
      workflowId,
      name: 'From version',
      version: {
        id: 'wfv-1',
        workflowId,
        versionNumber: 1,
        definitionJson: JSON.stringify(definition),
        mermaid: '',
        summaryMarkdown: '',
        compilerMetadataJson: '{}',
        createdAt: new Date().toISOString(),
      },
    })

    expect(JSON.parse(files.workflowDefinitionJson).name).toBe('From version')

    const sourceDir = join(testWorkflowsRoot, workflowId, 'source')
    expect(
      await readFile(join(sourceDir, WORKFLOW_DEFINITION_JSON_FILENAME), 'utf-8'),
    ).toContain('From version')
  })

  it('does not overwrite existing workflow_definition.json on sync', async () => {
    const sourceDir = join(testWorkflowsRoot, workflowId, 'source')
    await mkdir(sourceDir, { recursive: true })
    const onDisk = blankSourceFiles(workflowId, 'On disk')
    await writeFile(
      join(sourceDir, WORKFLOW_DEFINITION_JSON_FILENAME),
      onDisk.workflowDefinitionJson,
      'utf-8',
    )
    await writeFile(
      join(sourceDir, ENTITIES_DEFINITION_JSON_FILENAME),
      onDisk.entitiesDefinitionJson,
      'utf-8',
    )

    const files = syncWorkflowSourceFiles({
      workflowId,
      name: 'Ignored',
      version: {
        id: 'wfv-1',
        workflowId,
        versionNumber: 1,
        definitionJson: JSON.stringify(
          buildBlankWorkflowDefinition({ id: workflowId, name: 'From version' }),
        ),
        mermaid: '',
        summaryMarkdown: '',
        compilerMetadataJson: '{}',
        createdAt: new Date().toISOString(),
      },
    })

    expect(JSON.parse(files.workflowDefinitionJson).name).toBe('On disk')
  })

  it('creates blank split files with workflow id when nothing exists', async () => {
    const files = syncWorkflowSourceFiles({
      workflowId,
      name: 'New workflow',
    })

    const parsed = JSON.parse(files.workflowDefinitionJson)
    expect(parsed.id).toBe(workflowId)
    expect(parsed.name).toBe('New workflow')
    expect(parsed.steps.length).toBeGreaterThan(0)
    expect(JSON.parse(files.entitiesDefinitionJson)).toEqual([])
  })
})
