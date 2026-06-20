import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadSkillActions } from '@main/skills/skill-module-loader'
import { resolveBundledSkillsDirectory } from '@main/skills/skill-path'
import type { SkillTool } from '@main/skills/types'
import {
  normalizeWorkflowSourceRelativePath,
  resolveWorkflowSourceFilePath,
  WORKFLOW_COMPILER_TOOL_NAMES,
} from './workflow-source-scope'
import { runWithWorkflowCompileContext } from './workflow-compile-context'
import type { WorkflowCompileContext } from './workflow-compile-context'
import { validateWorkflowDefinitionJsonSource } from './workflow-source-validate'
import {
  ENTITIES_DEFINITION_JSON_FILENAME,
  serializeEntitiesDefinition,
  serializeWorkflowDefinitionBody,
  WORKFLOW_DEFINITION_JSON_FILENAME,
} from '@shared/workflows/source-files'
import { buildBlankWorkflowDefinition } from './workflow-store'

const CONTEXT_STACK_KEY = Symbol.for('openfde.workflowCompileContextStack')
const workflowCompilerSkillFolder = join(
  resolveBundledSkillsDirectory(),
  'workflow-compiler',
)
const hasBundledWorkflowCompilerSkill = existsSync(
  join(workflowCompilerSkillFolder, 'skill.md'),
)
const workflowCompilerIt = hasBundledWorkflowCompilerSkill ? it : it.skip

let testWorkflowsRoot = ''

vi.mock('@config/openfde-home', () => ({
  getWorkflowSourceDir: (workflowId: string) => join(testWorkflowsRoot, workflowId, 'source'),
  getopenfdeWorkflowsDir: () => testWorkflowsRoot,
}))

function validWorkflowDefinitionJson(workflowId: string): string {
  const definition = buildBlankWorkflowDefinition({ id: workflowId, name: 'Test workflow' })
  const { entities, ...body } = definition
  return serializeWorkflowDefinitionBody(body)
}

async function loadWorkflowCompilerTools(): Promise<SkillTool[]> {
  const skillFolder = join(resolveBundledSkillsDirectory(), 'workflow-compiler')
  return loadSkillActions(skillFolder, [])
}

async function runWorkflowTool<T>(
  toolCtx: {
    workflowId: string
    workflowName: string
    knownTools?: Set<string>
    sourceDir?: string
  },
  toolName: string,
  input: Record<string, unknown>,
): Promise<T> {
  const tools = await loadWorkflowCompilerTools()
  const tool = tools.find((t) => t.name === toolName)
  if (!tool) {
    throw new Error(`Tool not found: ${toolName}`)
  }
  return runWithWorkflowCompileContext(toolCtx, () =>
    tool.execute(input),
  ) as Promise<T>
}

describe('workflow source scope', () => {
  it('allows only split workflow source files', () => {
    expect(normalizeWorkflowSourceRelativePath('workflow_definition.json')).toBe(
      WORKFLOW_DEFINITION_JSON_FILENAME,
    )
    expect(normalizeWorkflowSourceRelativePath('entities_definition.json')).toBe(
      ENTITIES_DEFINITION_JSON_FILENAME,
    )
    expect(() => normalizeWorkflowSourceRelativePath('../secrets.txt')).toThrow(
      /not allowed/,
    )
  })
})

describe('workflow definition validation', () => {
  it('detects invalid workflow_definition.json schema errors', () => {
    const result = validateWorkflowDefinitionJsonSource(
      { workflowId: 'wf-test', workflowName: 'Test' },
      JSON.stringify({ version: 1, id: 'wf-test', name: 'Broken' }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('workflow_definition.json'))).toBe(true)
  })
})

describe('workflow compiler skill actions', () => {
  let workflowId = ''
  let sourceDir = ''
  let toolCtx: {
    workflowId: string
    workflowName: string
    knownTools?: Set<string>
    sourceDir: string
  }

  beforeEach(async () => {
    testWorkflowsRoot = await mkdtemp(join(tmpdir(), 'openfde-wf-scope-'))
    workflowId = `wf-scope-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    sourceDir = join(testWorkflowsRoot, workflowId, 'source')
    toolCtx = {
      workflowId,
      workflowName: 'Test workflow',
      knownTools: new Set(['run_script']),
      sourceDir,
    }
  })

  afterEach(async () => {
    await rm(testWorkflowsRoot, { recursive: true, force: true })
    const g = globalThis as typeof globalThis & {
      [typeof CONTEXT_STACK_KEY]?: WorkflowCompileContext[]
    }
    delete g[CONTEXT_STACK_KEY]
  })

  if (!hasBundledWorkflowCompilerSkill) {
    it('returns no tools when workflow compiler bundled skill is absent', async () => {
      const tools = await loadWorkflowCompilerTools()
      expect(tools).toEqual([])
    })
  }

  workflowCompilerIt('loads split workflow tools from skills/workflow-compiler/actions', async () => {
    const tools = await loadWorkflowCompilerTools()
    expect(tools.map((t) => t.name).sort()).toEqual([...WORKFLOW_COMPILER_TOOL_NAMES].sort())
  })

  workflowCompilerIt('reads and writes workflow_definition.json', async () => {
    await mkdir(sourceDir, { recursive: true })
    const json = validWorkflowDefinitionJson(workflowId)
    await writeFile(join(sourceDir, WORKFLOW_DEFINITION_JSON_FILENAME), json, 'utf-8')
    await writeFile(
      join(sourceDir, ENTITIES_DEFINITION_JSON_FILENAME),
      serializeEntitiesDefinition([]),
      'utf-8',
    )

    const read = await runWorkflowTool<{ file: string; content: string }>(
      toolCtx,
      'read_workflow_definition',
      {},
    )
    expect(read).toMatchObject({ file: WORKFLOW_DEFINITION_JSON_FILENAME })
    expect(read.content).toContain('"Test workflow"')

    const abs = resolveWorkflowSourceFilePath(workflowId, WORKFLOW_DEFINITION_JSON_FILENAME)
    expect(abs.startsWith(sourceDir)).toBe(true)

    const list = await runWorkflowTool<{ files: Array<{ path: string; exists: boolean }> }>(
      toolCtx,
      'list_workflow_files',
      {},
    )
    expect(list.files).toEqual(
      expect.arrayContaining([
        { path: WORKFLOW_DEFINITION_JSON_FILENAME, exists: true },
        { path: ENTITIES_DEFINITION_JSON_FILENAME, exists: true },
      ]),
    )
  })

  workflowCompilerIt('returns validation errors after invalid workflow write', async () => {
    const result = await runWorkflowTool<Record<string, unknown>>(toolCtx, 'write_workflow_definition', {
      content: JSON.stringify({ version: 1, id: workflowId, name: 'Broken' }),
    })

    expect(result).toMatchObject({
      written: true,
      file: WORKFLOW_DEFINITION_JSON_FILENAME,
      valid: false,
    })
    expect(result).toEqual(
      expect.objectContaining({
        validationErrors: expect.arrayContaining([
          expect.stringContaining('workflow_definition.json'),
        ]),
        message: expect.stringContaining('validation failed'),
      }),
    )
  })

  workflowCompilerIt('returns valid=true for a well-formed workflow definition', async () => {
    const result = await runWorkflowTool<Record<string, unknown>>(toolCtx, 'write_workflow_definition', {
      content: validWorkflowDefinitionJson(workflowId),
    })

    expect(result).toMatchObject({ valid: true, file: WORKFLOW_DEFINITION_JSON_FILENAME })
    expect(result).toEqual(
      expect.objectContaining({
        validationErrors: [],
        message: expect.stringContaining('validated successfully'),
      }),
    )
  })

  workflowCompilerIt('add_entity_field returns entities array and canonical JSON', async () => {
    await runWorkflowTool(toolCtx, 'write_workflow_definition', {
      content: validWorkflowDefinitionJson(workflowId),
    })

    const result = await runWorkflowTool<{
      entities: Array<{ id: string; fields: Array<{ key: string }> }>
      content: string
      valid: boolean
    }>(toolCtx, 'add_entity_field', {
      entity_id: 'customer',
      entity_name: 'Customer',
      field: {
        key: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        source: { kind: 'user_input', formStepId: 'step_1' },
      },
    })

    expect(result.valid).toBe(true)
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0]?.fields[0]?.key).toBe('email')
    expect(JSON.parse(result.content)).toEqual(result.entities)
  })

  workflowCompilerIt('requires workflow compile context outside a compiler run', async () => {
    const tools = await loadWorkflowCompilerTools()
    const readWorkflowDefinition = tools.find((t) => t.name === 'read_workflow_definition')!
    await expect(readWorkflowDefinition.execute({})).rejects.toThrow(/compile context/i)
  })
})
