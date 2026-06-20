import { describe, expect, it } from 'vitest'
import {
  isReferenceMcpServer,
  REFERENCE_MCP_SERVER_DEFINITIONS,
} from '@shared/mcp/reference-mcp-servers'

describe('reference-mcp-servers', () => {
  it('includes the six official reference servers', () => {
    expect(REFERENCE_MCP_SERVER_DEFINITIONS.map((item) => item.name)).toEqual([
      'Everything',
      'Fetch',
      'Filesystem',
      'Memory',
      'Time',
      'Sequential Thinking',
    ])
  })

  it('stores filesystem MCP without static directory args', () => {
    const filesystem = REFERENCE_MCP_SERVER_DEFINITIONS.find(
      (item) => item.id === 'ref-mcp-filesystem',
    )
    expect(filesystem?.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
    ])
  })

  it('identifies reference servers by id', () => {
    expect(isReferenceMcpServer({ id: 'ref-mcp-filesystem' })).toBe(true)
    expect(isReferenceMcpServer({ id: 'custom-fs' })).toBe(false)
  })

  it('uses uvx for python reference servers', () => {
    const fetch = REFERENCE_MCP_SERVER_DEFINITIONS.find(
      (item) => item.id === 'ref-mcp-fetch',
    )
    const time = REFERENCE_MCP_SERVER_DEFINITIONS.find(
      (item) => item.id === 'ref-mcp-time',
    )
    expect(fetch?.command).toBe('uvx')
    expect(fetch?.args).toEqual(['mcp-server-fetch'])
    expect(time?.command).toBe('uvx')
    expect(time?.args).toEqual(['mcp-server-time'])
  })
})
