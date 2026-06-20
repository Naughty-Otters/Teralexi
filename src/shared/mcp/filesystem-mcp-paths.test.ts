import { describe, expect, it } from 'vitest'
import {
  buildFilesystemMcpArgs,
  resolveFilesystemMcpAllowedPaths,
} from '@shared/mcp/filesystem-mcp-paths'

describe('filesystem-mcp-paths', () => {
  it('includes sandbox and optional workspace without duplicates', () => {
    expect(
      resolveFilesystemMcpAllowedPaths({
        sandboxRoot: '/tmp/sandbox',
        workspacePath: '/tmp/project',
      }),
    ).toEqual(['/tmp/sandbox', '/tmp/project'])
  })

  it('returns sandbox only when workspace is unset', () => {
    expect(
      resolveFilesystemMcpAllowedPaths({
        sandboxRoot: '/tmp/sandbox',
        workspacePath: null,
      }),
    ).toEqual(['/tmp/sandbox'])
  })

  it('dedupes identical sandbox and workspace paths', () => {
    expect(
      resolveFilesystemMcpAllowedPaths({
        sandboxRoot: '/tmp/same',
        workspacePath: '/tmp/same',
      }),
    ).toEqual(['/tmp/same'])
  })

  it('builds npx args with allowed directories', () => {
    expect(buildFilesystemMcpArgs(['/tmp/sandbox', '/tmp/project'])).toEqual([
      '-y',
      '@modelcontextprotocol/server-filesystem',
      '/tmp/sandbox',
      '/tmp/project',
    ])
  })
})
