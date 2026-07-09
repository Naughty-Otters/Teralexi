import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listServers, getServerVersion } = vi.hoisted(() => ({
  listServers: vi.fn(),
  getServerVersion: vi.fn(),
}))

vi.mock('mcp-registry-spec-sdk', () => ({
  MCPRegistryClient: vi.fn(function MCPRegistryClientMock() {
    return {
      server: {
        listServers,
        getServerVersion,
      },
    }
  }),
}))

vi.mock('@main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  instrumentInstanceMethods: <T>(instance: T) => instance,
}))

import { McpRegistryService, getMcpRegistryService } from './mcp-registry-service'

const filesystemEntry = {
  server: {
    name: 'com.example/filesystem',
    title: 'Filesystem',
    description: 'Local filesystem access',
    version: '1.2.3',
    packages: [
      {
        registryType: 'npm',
        identifier: '@modelcontextprotocol/server-filesystem',
        version: '1.2.3',
        runtimeHint: 'npx',
        runtimeArguments: [{ value: '-y', type: 'positional' }],
        transport: { type: 'stdio' },
      },
    ],
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': { isLatest: true },
  },
}

describe('McpRegistryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('searches servers and maps summaries', async () => {
    listServers.mockResolvedValue({
      servers: [filesystemEntry],
      metadata: { nextCursor: 'cursor-2' },
    })

    const service = new McpRegistryService('https://registry.test')
    const result = await service.searchServers({ search: 'filesystem', limit: 10 })

    expect(listServers).toHaveBeenCalledWith({
      search: 'filesystem',
      cursor: undefined,
      limit: 10,
      version: 'latest',
    })
    expect(result.servers).toHaveLength(1)
    expect(result.servers[0]).toMatchObject({
      name: 'com.example/filesystem',
      title: 'Filesystem',
    })
    expect(result.nextCursor).toBe('cursor-2')
  })

  it('trims blank search terms', async () => {
    listServers.mockResolvedValue({ servers: [], metadata: {} })
    const service = new McpRegistryService()
    await service.searchServers({ search: '   ' })
    expect(listServers).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
    )
  })

  it('loads server drafts and preferred transport', async () => {
    getServerVersion.mockResolvedValue({
      server: filesystemEntry.server,
      _meta: filesystemEntry._meta,
    })

    const service = new McpRegistryService()
    const result = await service.getServerDrafts({
      serverName: 'com.example/filesystem',
      preferredTransport: 'stdio',
    })

    expect(getServerVersion).toHaveBeenCalledWith(
      'com.example/filesystem',
      'latest',
    )
    expect(result.summary.name).toBe('com.example/filesystem')
    expect(result.drafts).toHaveLength(1)
    expect(result.preferredDraft?.transportType).toBe('stdio')
  })

  it('throws when registry server cannot be summarized', async () => {
    getServerVersion.mockResolvedValue({
      server: { name: '', version: '1.0.0' },
      _meta: {},
    })

    const service = new McpRegistryService()
    await expect(
      service.getServerDrafts({ serverName: 'missing/server' }),
    ).rejects.toThrow(/Registry server not found/)
  })
})

describe('getMcpRegistryService', () => {
  it('returns a singleton service instance', () => {
    expect(getMcpRegistryService()).toBe(getMcpRegistryService())
  })
})
