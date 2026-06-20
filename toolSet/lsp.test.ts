import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OTTER_AGENT_SANDBOX_ROOT_ENV,
  OTTER_AGENT_WORKSPACE_PATH_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
  WORKSPACE_PATH_GLOBAL_KEY,
} from './sandbox-paths'

const querySymbolsMock = vi.fn()

vi.mock('@main/agent/lsp', () => ({
  getLspManager: () => ({ querySymbols: querySymbolsMock }),
}))

import { lspTool } from './lsp'

function setWorkspaceRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[WORKSPACE_PATH_GLOBAL_KEY] = root
    process.env[OTTER_AGENT_WORKSPACE_PATH_ENV] = root
  } else {
    delete g[WORKSPACE_PATH_GLOBAL_KEY]
    delete process.env[OTTER_AGENT_WORKSPACE_PATH_ENV]
  }
}

function setSandboxRoot(root: string | undefined) {
  const g = globalThis as unknown as Record<string, unknown>
  if (root) {
    g[SANDBOX_ROOT_GLOBAL_KEY] = root
    process.env[OTTER_AGENT_SANDBOX_ROOT_ENV] = root
  } else {
    delete g[SANDBOX_ROOT_GLOBAL_KEY]
    delete process.env[OTTER_AGENT_SANDBOX_ROOT_ENV]
  }
}

describe('lsp tool', () => {
  let workspaceRoot: string
  let sandboxRoot: string

  beforeEach(async () => {
    querySymbolsMock.mockReset()
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'openfde-lsp-tool-'))
    sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openfde-lsp-sb-'))
    setWorkspaceRoot(workspaceRoot)
    setSandboxRoot(sandboxRoot)
  })

  afterEach(() => {
    setWorkspaceRoot(undefined)
    setSandboxRoot(undefined)
  })

  it('requires a workspace folder', async () => {
    setWorkspaceRoot(undefined)
    const result = await lspTool.execute({ operation: 'document_symbols', path: 'src/a.ts' })
    expect(result).toMatchObject({
      error: expect.stringContaining('workspace folder'),
    })
    expect(querySymbolsMock).not.toHaveBeenCalled()
  })

  it('rejects invalid input', async () => {
    const result = await lspTool.execute({ operation: 'bad-op', path: 'a.ts' })
    expect(result).toMatchObject({ error: expect.stringContaining('Invalid lsp input') })
  })

  it('requires query for workspace_symbols', async () => {
    const result = await lspTool.execute({
      operation: 'workspace_symbols',
      path: 'src/a.ts',
    })
    expect(result).toEqual({ error: 'workspace_symbols requires a non-empty query.' })
  })

  it('delegates to LSP manager with resolved absolute path', async () => {
    querySymbolsMock.mockResolvedValue({
      ok: true,
      operation: 'document_symbols',
      symbols: [],
    })

    const result = await lspTool.execute({
      operation: 'document_symbols',
      path: 'src/main.ts',
    })

    expect(querySymbolsMock).toHaveBeenCalledWith({
      operation: 'document_symbols',
      absFilePath: path.join(workspaceRoot, 'src/main.ts'),
      workspaceRoot,
      line: undefined,
      character: undefined,
      query: undefined,
    })
    expect(result).toMatchObject({ ok: true, operation: 'document_symbols' })
  })

  it('resolves pseudo-absolute /src/ paths against the workspace root', async () => {
    querySymbolsMock.mockResolvedValue({
      ok: true,
      operation: 'document_symbols',
      symbols: [],
    })

    await lspTool.execute({
      operation: 'document_symbols',
      path: '/src/main.ts',
    })

    expect(querySymbolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        absFilePath: path.join(workspaceRoot, 'src/main.ts'),
      }),
    )
  })

  it('passes 1-based line and character through to manager', async () => {
    querySymbolsMock.mockResolvedValue({ ok: true, operation: 'hover', hover: 'string' })

    await lspTool.execute({
      operation: 'hover',
      path: 'src/a.ts',
      line: 10,
      character: 4,
    })

    expect(querySymbolsMock).toHaveBeenCalledWith(
      expect.objectContaining({ line: 10, character: 4 }),
    )
  })
})
