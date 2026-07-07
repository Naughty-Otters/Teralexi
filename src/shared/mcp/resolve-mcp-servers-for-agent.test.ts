import { describe, expect, it } from 'vitest'
import {
  resolveMcpServersForAgent,
  unionMcpServerIdsForAgents,
} from './resolve-mcp-servers-for-agent'

const servers = [
  { id: 'a', enabled: true },
  { id: 'b', enabled: true },
  { id: 'c', enabled: false },
]

describe('resolveMcpServersForAgent', () => {
  it('returns all active servers when agent allowlist is null', () => {
    expect(resolveMcpServersForAgent(servers, null).map((s) => s.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('returns explicit allowlist intersected with active servers', () => {
    expect(
      resolveMcpServersForAgent(servers, ['b', 'c']).map((s) => s.id),
    ).toEqual(['b'])
  })

  it('returns empty when allowlist is empty', () => {
    expect(resolveMcpServersForAgent(servers, [])).toEqual([])
  })
})

describe('unionMcpServerIdsForAgents', () => {
  it('returns empty when no agents or no active servers', () => {
    expect(unionMcpServerIdsForAgents(servers, [])).toEqual([])
    expect(
      unionMcpServerIdsForAgents([{ id: 'x', enabled: false }], [
        { availableMcpServers: ['x'] },
      ]),
    ).toEqual([])
  })

  it('unions explicit agent allowlists', () => {
    expect(
      unionMcpServerIdsForAgents(servers, [
        { availableMcpServers: ['a'] },
        { availableMcpServers: ['b'] },
      ]),
    ).toEqual(['a', 'b'])
  })

  it('treats null allowlist as all active servers', () => {
    expect(
      unionMcpServerIdsForAgents(servers, [{ availableMcpServers: null }]),
    ).toEqual(['a', 'b'])
  })
})
