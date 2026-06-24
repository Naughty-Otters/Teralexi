import { describe, expect, it, vi } from 'vitest'

vi.mock('@main/config/app-paths', () => ({
  resolveAppRoot: () => '/app',
}))

vi.mock('@main/agent/lsp/language-servers', () => ({
  buildServerPath: () => '/usr/local/bin:/opt/homebrew/bin',
}))

import {
  mcpRuntimeInstallUrl,
  mcpRuntimeKindForCommand,
  referenceMcpRuntimeKind,
} from './mcp-runtime-requirements'

describe('mcp-runtime-requirements', () => {
  it('detects runtime kinds from launch commands', () => {
    expect(mcpRuntimeKindForCommand('npx')).toBe('npx')
    expect(mcpRuntimeKindForCommand('uvx')).toBe('uvx')
    expect(mcpRuntimeKindForCommand('/usr/local/bin/my-mcp')).toBeNull()
  })

  it('maps reference servers to npx or uvx', () => {
    expect(
      referenceMcpRuntimeKind({
        id: 'ref-mcp-filesystem',
        command: 'npx',
      }),
    ).toBe('npx')
    expect(
      referenceMcpRuntimeKind({
        id: 'ref-mcp-fetch',
        command: 'uvx',
      }),
    ).toBe('uvx')
  })

  it('returns install urls', () => {
    expect(mcpRuntimeInstallUrl('npx')).toContain('nodejs.org')
    expect(mcpRuntimeInstallUrl('uvx')).toContain('docs.astral.sh/uv')
  })
})
