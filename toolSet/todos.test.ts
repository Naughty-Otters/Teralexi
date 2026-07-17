import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV,
  TERALEXI_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY,
  SANDBOX_ROOT_GLOBAL_KEY,
} from './sandbox-paths'
import { readTodos, updateTodos } from './todos'
import { todosFileName } from '@shared/agent/todos'

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_SANDBOX_ROOT_ENV]
  }
}

function setSandboxOutputScope(scope: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (scope) {
    g[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY] = scope
    process.env[TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV] = scope
  } else {
    delete g[SANDBOX_OUTPUT_SCOPE_GLOBAL_KEY]
    delete process.env[TERALEXI_AGENT_SANDBOX_OUTPUT_SCOPE_ENV]
  }
}

describe('todo tools', () => {
  let sandboxRoot: string

  beforeEach(async () => {
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'teralexi-todos-'))
    setSandboxRoot(sandboxRoot)
    setSandboxOutputScope(undefined)
  })

  afterEach(async () => {
    setSandboxRoot(undefined)
    setSandboxOutputScope(undefined)
    await rm(sandboxRoot, { recursive: true, force: true })
  })

  it('update_todos requires an active sandbox', async () => {
    setSandboxRoot(undefined)
    const result = await updateTodos.execute({
      todos: [{ content: 'Do work', status: 'pending' }],
    })
    expect(result).toMatchObject({
      error: expect.stringContaining('No active sandbox'),
    })
  })

  it('update_todos persists and returns checklist summary', async () => {
    const result = await updateTodos.execute({
      todos: [
        { content: 'Explore codebase', status: 'completed' },
        { content: 'Write tests', status: 'in_progress' },
      ],
    })

    expect(result).toMatchObject({
      ok: true,
      summary: expect.objectContaining({
        total: 2,
        completed: 1,
        inProgress: 1,
      }),
      checklist: expect.stringContaining('Write tests'),
    })

    const file = path.join(sandboxRoot, todosFileName('main'))
    const raw = await readFile(file, 'utf-8')
    const parsed = JSON.parse(raw) as { todos: Array<{ content: string; status: string }> }
    expect(parsed.todos.map((t) => t.content)).toEqual([
      'Explore codebase',
      'Write tests',
    ])
  })

  it('update_todos includes stop message when allDone', async () => {
    const result = await updateTodos.execute({
      todos: [{ content: 'Ship feature', status: 'completed' }],
    })
    expect(result).toMatchObject({
      ok: true,
      done: true,
      summary: expect.objectContaining({ allDone: true }),
      message: expect.stringContaining('allDone=true'),
    })
  })

  it('read_todos returns empty list when file is missing', async () => {
    const result = await readTodos.execute({})
    expect(result).toMatchObject({
      ok: true,
      todos: [],
      summary: expect.objectContaining({ total: 0 }),
    })
  })

  it('read_todos returns persisted list after update', async () => {
    await updateTodos.execute({
      todos: [{ content: 'Ship feature', status: 'pending' }],
    })
    const result = await readTodos.execute({})
    expect(result).toMatchObject({
      ok: true,
      todos: [expect.objectContaining({ content: 'Ship feature', status: 'pending' })],
    })
  })

  it('uses scoped namespace for todos file', async () => {
    setSandboxOutputScope('output/subRuns/step-2/results')
    await updateTodos.execute({
      todos: [{ content: 'Scoped task', status: 'pending' }],
    })

    const scopedFile = path.join(sandboxRoot, todosFileName('sub-step-2'))
    const raw = await readFile(scopedFile, 'utf-8')
    expect(JSON.parse(raw).todos[0].content).toBe('Scoped task')
  })

  it('rejects invalid input shape', async () => {
    const result = await updateTodos.execute({ todos: 'not-an-array' })
    expect(result).toMatchObject({ error: expect.any(String) })
  })
})
