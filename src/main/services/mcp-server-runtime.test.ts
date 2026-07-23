import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getWorkspacePathMock = vi.hoisted(() => vi.fn())
const resolvePlanSandboxRootMock = vi.hoisted(() => vi.fn())
const stableSandboxRootForConversationMock = vi.hoisted(() => vi.fn())

vi.mock('@main/agent/workspace/conversation-workspace', () => ({
  getWorkspacePath: getWorkspacePathMock,
}))

vi.mock('@main/agent/coding/plan-mode-storage-impl', () => ({
  resolvePlanSandboxRoot: resolvePlanSandboxRootMock,
  stableSandboxRootForConversation: stableSandboxRootForConversationMock,
}))

import { resolveRuntimeMcpServer } from './mcp-server-runtime'
import type { StoredMcpServer } from './conversation-store/types'

describe('mcp-server-runtime', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
    vi.clearAllMocks()
  })

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
  }

  const filesystemServer: StoredMcpServer = {
    id: 'ref-mcp-filesystem',
    userId: 'default',
    name: 'Filesystem',
    transportType: 'stdio',
    url: '',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    env: {},
    headers: {},
    enabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('resolves sandbox and conversation workspace for filesystem MCP', () => {
    const sandboxRoot = tempDir('mcp-sandbox-')
    const workspacePath = tempDir('mcp-workspace-')

    resolvePlanSandboxRootMock.mockReturnValue(sandboxRoot)
    getWorkspacePathMock.mockReturnValue(workspacePath)

    const resolved = resolveRuntimeMcpServer(filesystemServer, {
      conversationId: 'conv-1',
    })

    expect(resolved.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
      sandboxRoot,
      workspacePath,
    ])
  })

  it('uses sandbox only when conversation workspace is unset', () => {
    const sandboxRoot = tempDir('mcp-sandbox-only-')
    resolvePlanSandboxRootMock.mockReturnValue(sandboxRoot)
    getWorkspacePathMock.mockReturnValue(null)

    const resolved = resolveRuntimeMcpServer(filesystemServer, {
      conversationId: 'conv-2',
    })

    expect(resolved.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
      sandboxRoot,
    ])
  })

  it('leaves non-reference servers unchanged', () => {
    const customServer: StoredMcpServer = {
      ...filesystemServer,
      id: 'custom-fs',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/custom'],
    }

    expect(resolveRuntimeMcpServer(customServer)).toEqual(customServer)
  })

  it('injects bundled CLI path for Playwright MCP when package is installed', async () => {
    const { setBrowserCdpEndpointHint } = await import(
      '@main/agent/browser/browser-session'
    )
    setBrowserCdpEndpointHint(null)
    const playwrightServer: StoredMcpServer = {
      ...filesystemServer,
      id: 'ref-mcp-playwright',
      name: 'Playwright Browser',
      command: 'node',
      args: ['@playwright/mcp'],
      enabled: true,
    }
    const resolved = resolveRuntimeMcpServer(playwrightServer)
    expect(resolved.command).toBe('node')
    expect(resolved.args[0]).toMatch(/cli\.js$/)
    expect(resolved.args[0]).toContain('@playwright')
    expect(resolved.env?.TMPDIR).toBeTruthy()
  })

  it('injects CDP endpoint args for Playwright MCP when a session hint exists', async () => {
    const { setBrowserCdpEndpointHint } = await import(
      '@main/agent/browser/browser-session'
    )
    setBrowserCdpEndpointHint('http://127.0.0.1:9222')
    const playwrightServer: StoredMcpServer = {
      ...filesystemServer,
      id: 'ref-mcp-playwright',
      name: 'Playwright Browser',
      command: 'node',
      args: ['@playwright/mcp'],
      enabled: true,
    }
    const resolved = resolveRuntimeMcpServer(playwrightServer)
    expect(resolved.args).toContain('--cdp-endpoint')
    expect(resolved.args).toContain('http://127.0.0.1:9222')
    expect(resolved.env?.PLAYWRIGHT_MCP_CDP_ENDPOINT).toBe(
      'http://127.0.0.1:9222',
    )
    setBrowserCdpEndpointHint(null)
  })

  it('creates sandbox directories before returning runtime args', () => {
    const sandboxRoot = join(tempDir('mcp-parent-'), 'nested-sandbox')
    resolvePlanSandboxRootMock.mockReturnValue(sandboxRoot)
    getWorkspacePathMock.mockReturnValue(null)

    resolveRuntimeMcpServer(filesystemServer, { conversationId: 'conv-3' })

    expect(existsSync(sandboxRoot)).toBe(true)
  })
})
