import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  ENTITIES_DEFINITION_JSON_FILENAME,
  serializeEntitiesDefinition,
  serializeWorkflowDefinitionBody,
  WORKFLOW_DEFINITION_JSON_FILENAME,
} from '@shared/workflows/source-files'
import { buildBlankWorkflowDefinition } from './workflow-store'

let testWorkflowsRoot = ''

vi.mock('@config/openfde-home', () => ({
  getWorkflowSourceDir: (workflowId: string) => join(testWorkflowsRoot, workflowId, 'source'),
  getopenfdeWorkflowsDir: () => testWorkflowsRoot,
}))

function sampleDefinition(workflowId: string) {
  return {
    version: 1,
    id: workflowId,
    name: 'Daily joke',
    status: 'draft',
    executor: { agentId: 'skill:workflow-runtime' },
    triggers: [{ type: 'manual' }],
    steps: [
      {
        id: 'collect_topic',
        type: 'channel',
        channelId: 'slack',
        action: 'collect_form',
        form: 'joke_request',
      },
      {
        id: 'fetch_joke',
        type: 'task',
        title: 'Fetch joke',
        expression: { tool: 'web_search', title: 'Fetch joke' },
      },
    ],
    entities: [
      {
        id: 'joke_request',
        name: 'Joke request',
        fields: [
          {
            key: 'topic',
            label: 'Topic',
            type: 'string',
            required: true,
            source: { kind: 'user_input', formStepId: 'collect_topic' },
          },
        ],
      },
    ],
  }
}

function splitSampleDefinition(workflowId: string) {
  const definition = sampleDefinition(workflowId)
  const { entities, ...body } = definition
  return {
    workflowDefinitionJson: serializeWorkflowDefinitionBody(body),
    entitiesDefinitionJson: serializeEntitiesDefinition(entities),
  }
}

const compileWorkflowWithTools = vi.fn(async (args: { workflowId: string }) => {
  const dir = join(testWorkflowsRoot, args.workflowId, 'source')
  await mkdir(dir, { recursive: true })
  const split = splitSampleDefinition(args.workflowId)
  await writeFile(
    join(dir, WORKFLOW_DEFINITION_JSON_FILENAME),
    split.workflowDefinitionJson,
    'utf-8',
  )
  await writeFile(
    join(dir, ENTITIES_DEFINITION_JSON_FILENAME),
    split.entitiesDefinitionJson,
    'utf-8',
  )
  return { assistantText: 'Updated workflow sources.' }
})

const mockWorkflow = {
  id: 'wf-existing',
  userId: 'default',
  name: 'Daily joke',
  description: '',
  status: 'draft',
  currentVersionId: null,
  createdAt: 'now',
  updatedAt: 'now',
}

vi.mock('./workflow-compiler-run', () => ({
  compileWorkflowWithTools: (...args: unknown[]) => compileWorkflowWithTools(...args),
}))

vi.mock('@main/skills/skill-compile-settings', () => ({
  loadSkillCompileSettings: () => ({ perSkill: {} }),
}))

vi.mock('@main/workflows/workflow-skills', () => ({
  loadWorkflowCompilerSystemPrompt: async () =>
    'You are the Workflow compiler. Use split JSON workflow tools only.',
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getWorkflow: vi.fn((id: string) =>
      id === mockWorkflow.id ? mockWorkflow : null,
    ),
    upsertWorkflow: vi.fn((w) => w),
    nextWorkflowVersionNumber: vi.fn(() => 1),
    insertWorkflowVersion: vi.fn((v) => ({ ...v, createdAt: 'now' })),
    getWorkflowVersion: vi.fn(),
    listWorkflowVersions: vi.fn(() => []),
  }),
}))

describe('compileWorkflow', () => {
  beforeEach(async () => {
    compileWorkflowWithTools.mockClear()
    testWorkflowsRoot = await mkdtemp(join(tmpdir(), 'openfde-wf-compile-'))
  })

  afterEach(async () => {
    await rm(testWorkflowsRoot, { recursive: true, force: true })
  })

  it('requires workflowId and compiles split sources into a version', async () => {
    const { compileWorkflow } = await import('./workflow-compiler')
    const result = await compileWorkflow({
      userId: 'default',
      workflowId: mockWorkflow.id,
      prompt: 'Daily dog joke workflow',
    })

    expect(compileWorkflowWithTools).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: mockWorkflow.id,
        workflowName: mockWorkflow.name,
      }),
    )
    expect(result.definitionJson).toContain('joke_request')
    expect(result.definition.steps).toHaveLength(2)
    expect(result.definition.entities).toHaveLength(1)
    expect(result.workflowId).toBe(mockWorkflow.id)

    const onDisk = await readFile(
      join(testWorkflowsRoot, mockWorkflow.id, 'source', WORKFLOW_DEFINITION_JSON_FILENAME),
      'utf-8',
    )
    expect(onDisk).toContain('Daily joke')
  })

  it('throws when workflowId is missing', async () => {
    const { compileWorkflow } = await import('./workflow-compiler')
    await expect(
      compileWorkflow({
        userId: 'default',
        workflowId: '',
        prompt: 'test',
      }),
    ).rejects.toThrow(/workflowId is required/)
  })

  it('reports schema validation errors from workflow_definition.json', async () => {
    compileWorkflowWithTools.mockImplementationOnce(async (args: { workflowId: string }) => {
      const dir = join(testWorkflowsRoot, args.workflowId, 'source')
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, WORKFLOW_DEFINITION_JSON_FILENAME),
        JSON.stringify({ version: 1, id: args.workflowId, name: 'Broken' }),
        'utf-8',
      )
      await writeFile(join(dir, ENTITIES_DEFINITION_JSON_FILENAME), '[]', 'utf-8')
      return { assistantText: 'done' }
    })

    const { compileWorkflow } = await import('./workflow-compiler')
    await expect(
      compileWorkflow({
        userId: 'default',
        workflowId: mockWorkflow.id,
        prompt: 'broken workflow',
      }),
    ).rejects.toThrow()
  })

  it('saves edited workflow definition JSON as a new version', async () => {
    const { saveWorkflowDefinitionFromJson } = await import('./workflow-compiler')
    const definition = buildBlankWorkflowDefinition({
      id: mockWorkflow.id,
      name: mockWorkflow.name,
    })

    const result = await saveWorkflowDefinitionFromJson({
      userId: 'default',
      workflowId: mockWorkflow.id,
      definitionJson: JSON.stringify(definition),
    })

    expect(result.versionId).toBeTruthy()
    expect(result.definition.executor.agentId).toBe('skill:workflow-runtime')
    expect(result.mermaid).toContain('step_1')
  })

  it('rejects invalid JSON when saving definition', async () => {
    const { saveWorkflowDefinitionFromJson } = await import('./workflow-compiler')
    await expect(
      saveWorkflowDefinitionFromJson({
        userId: 'default',
        workflowId: mockWorkflow.id,
        definitionJson: '{{{{',
      }),
    ).rejects.toThrow(/Invalid JSON/)
  })
})
