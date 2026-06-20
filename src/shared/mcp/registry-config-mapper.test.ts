import { describe, expect, it } from 'vitest'
import {
  dedupeRegistryEntries,
  listRegistryServerDrafts,
  mapRegistryTransportType,
  pickPreferredRegistryDraft,
  registryDraftToKvLines,
  toRegistryServerSummary,
} from '@shared/mcp/registry-config-mapper'

describe('registry-config-mapper', () => {
  it('maps registry transport types', () => {
    expect(mapRegistryTransportType('stdio')).toBe('stdio')
    expect(mapRegistryTransportType('sse')).toBe('sse')
    expect(mapRegistryTransportType('streamable-http')).toBe('http')
    expect(mapRegistryTransportType('http')).toBe('http')
    expect(mapRegistryTransportType('unknown')).toBeNull()
  })

  it('dedupes registry entries by latest version', () => {
    const entries = dedupeRegistryEntries([
      {
        server: {
          name: 'com.example/server',
          version: '1.0.0',
          packages: [{ transport: { type: 'stdio' }, identifier: 'pkg' }],
        },
        _meta: {
          'io.modelcontextprotocol.registry/official': { isLatest: false },
        },
      },
      {
        server: {
          name: 'com.example/server',
          version: '2.0.0',
          packages: [{ transport: { type: 'stdio' }, identifier: 'pkg' }],
        },
        _meta: {
          'io.modelcontextprotocol.registry/official': { isLatest: true },
        },
      },
    ])

    expect(entries).toHaveLength(1)
    expect(entries[0]?.server?.version).toBe('2.0.0')
  })

  it('builds stdio draft from npm package metadata', () => {
    const drafts = listRegistryServerDrafts({
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
            environmentVariables: [
              {
                name: 'ROOT_PATH',
                description: 'Allowed root path',
                isRequired: true,
              },
            ],
          },
        ],
      },
    })

    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      name: 'Filesystem',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem@1.2.3'],
      envTemplate: [{ name: 'ROOT_PATH', isRequired: true }],
      source: 'package',
      registryName: 'com.example/filesystem',
    })
  })

  it('builds remote http draft with header templates', () => {
    const drafts = listRegistryServerDrafts({
      server: {
        name: 'ai.example/remote',
        version: '1.0.0',
        remotes: [
          {
            type: 'streamable-http',
            url: 'https://api.example.com/mcp',
            headers: [
              {
                name: 'Authorization',
                description: 'Bearer token',
                isRequired: true,
                placeholder: 'Bearer <token>',
              },
            ],
          },
        ],
      },
    })

    expect(drafts[0]).toMatchObject({
      transportType: 'http',
      url: 'https://api.example.com/mcp',
      headersTemplate: [{ name: 'Authorization', isRequired: true }],
      source: 'remote',
    })
  })

  it('prefers stdio draft when no transport preference is set', () => {
    const preferred = pickPreferredRegistryDraft([
      {
        name: 'Remote',
        transportType: 'http',
        url: 'https://example.com',
        command: '',
        args: [],
        envTemplate: [],
        headersTemplate: [],
        source: 'remote',
        registryName: 'ai.example/remote',
        registryVersion: '1.0.0',
      },
      {
        name: 'Local',
        transportType: 'stdio',
        url: '',
        command: 'npx',
        args: ['-y', 'pkg'],
        envTemplate: [],
        headersTemplate: [],
        source: 'package',
        registryName: 'ai.example/local',
        registryVersion: '1.0.0',
      },
    ])

    expect(preferred?.transportType).toBe('stdio')
  })

  it('serializes env/header templates into key-value lines', () => {
    const lines = registryDraftToKvLines(
      [{ name: 'API_KEY', default: 'abc' }, { name: 'OPTIONAL' }],
      { API_KEY: 'secret' },
    )

    expect(lines).toBe('API_KEY: secret')
  })

  it('summarizes transport types from packages and remotes', () => {
    const summary = toRegistryServerSummary({
      server: {
        name: 'com.example/mixed',
        version: '1.0.0',
        packages: [{ transport: { type: 'stdio' }, identifier: 'pkg' }],
        remotes: [{ type: 'sse', url: 'https://example.com/sse' }],
      },
    })

    expect(summary?.transportTypes).toEqual(['stdio', 'sse'])
  })

  it('picks sse draft when preferred', () => {
    const drafts = [
      {
        name: 'Remote',
        transportType: 'stdio' as const,
        url: '',
        command: 'npx',
        args: ['pkg'],
        envTemplate: [],
        headersTemplate: [],
        source: 'package' as const,
        registryName: 'ai.example/remote',
        registryVersion: '1.0.0',
      },
      {
        name: 'SSE',
        transportType: 'sse' as const,
        url: 'https://example.com/sse',
        command: '',
        args: [],
        envTemplate: [],
        headersTemplate: [],
        source: 'remote' as const,
        registryName: 'ai.example/sse',
        registryVersion: '1.0.0',
      },
      {
        name: 'HTTP',
        transportType: 'http' as const,
        url: 'https://example.com/http',
        command: '',
        args: [],
        envTemplate: [],
        headersTemplate: [],
        source: 'remote' as const,
        registryName: 'ai.example/http',
        registryVersion: '1.0.0',
      },
    ]
    const preferred = pickPreferredRegistryDraft(drafts, 'sse')
    expect(preferred?.transportType).toBe('sse')
  })

  it('falls back to http when stdio unavailable', () => {
    const drafts = [
      {
        name: 'SSE',
        transportType: 'sse' as const,
        url: 'https://example.com/sse',
        command: '',
        args: [],
        envTemplate: [],
        headersTemplate: [],
        source: 'remote' as const,
        registryName: 'ai.example/sse',
        registryVersion: '1.0.0',
      },
      {
        name: 'HTTP',
        transportType: 'http' as const,
        url: 'https://example.com/http',
        command: '',
        args: [],
        envTemplate: [],
        headersTemplate: [],
        source: 'remote' as const,
        registryName: 'ai.example/http',
        registryVersion: '1.0.0',
      },
    ]
    const preferred = pickPreferredRegistryDraft(drafts)
    expect(preferred?.transportType).toBe('http')
  })

  it('returns first draft as last resort', () => {
    const drafts = [
      {
        name: 'SSE Only',
        transportType: 'sse' as const,
        url: 'https://example.com/sse',
        command: '',
        args: [],
        envTemplate: [],
        headersTemplate: [],
        source: 'remote' as const,
        registryName: 'ai.example/sse',
        registryVersion: '1.0.0',
      },
    ]
    const preferred = pickPreferredRegistryDraft(drafts)
    expect(preferred?.transportType).toBe('sse')
  })

  it('builds http draft from package with environment variables', () => {
    const drafts = listRegistryServerDrafts({
      server: {
        name: 'pkg/http',
        version: '1.0.0',
        packages: [
          {
            transport: { type: 'http', url: 'https://api.example.com' },
            identifier: 'pkg',
            environmentVariables: [
              {
                name: 'AUTH_TOKEN',
                description: 'Bearer token',
                isRequired: true,
              },
            ],
          },
        ],
      },
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.transportType).toBe('http')
    expect(drafts[0]?.envTemplate).toHaveLength(1)
    expect(drafts[0]?.envTemplate?.[0]?.name).toBe('AUTH_TOKEN')
  })

  it('handles empty draft array', () => {
    const preferred = pickPreferredRegistryDraft([])
    expect(preferred).toBeNull()
  })

  it('handles null registry server', () => {
    const drafts = listRegistryServerDrafts({ server: undefined })
    expect(drafts).toHaveLength(0)
  })

  it('dedupes entries keeping latest when meta indicates isLatest', () => {
    const entries = dedupeRegistryEntries([
      {
        server: {
          name: 'com.example/pkg',
          version: '1.0.0',
        },
        _meta: {},
      },
      {
        server: {
          name: 'com.example/pkg',
          version: '1.0.0',
        },
        _meta: {
          'io.modelcontextprotocol.registry/official': { isLatest: true },
        },
      },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0]?._meta).toBeDefined()
  })

  it('skips entries with empty server name', () => {
    const entries = dedupeRegistryEntries([
      {
        server: {
          name: '   ',
          version: '1.0.0',
        },
      },
      {
        server: {
          name: 'com.example/valid',
          version: '1.0.0',
        },
      },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0]?.server?.name).toBe('com.example/valid')
  })
})
