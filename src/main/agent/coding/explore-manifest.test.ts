import { describe, expect, it } from 'vitest'
import type { StoredToolResult } from '@main/services/conversation-store/types'
import { TOOL_LOOP_STEP_ID } from '../constants/step-ids'
import {
  buildExploreManifestFromToolResults,
  filterExplorePhaseToolResults,
  formatExploreManifestForInstructions,
  parsePathFromInputSummary,
  parsePatternFromInputSummary,
  parseQueryFromInputSummary,
  parseUrlFromInputSummary,
  htmlToTextSnippet,
  resolveExploreSessionStartAt,
} from './explore-manifest'

function toolResult(
  overrides: Partial<StoredToolResult> & {
    toolName: string
    outputText: string
  },
): StoredToolResult {
  return {
    id: 'id-1',
    conversationId: 'conv-1',
    agentId: 'agent-1',
    stepId: TOOL_LOOP_STEP_ID,
    inputSummary: '',
    outputSummary: '',
    outputChars: overrides.outputText.length,
    isError: false,
    createdAt: '2026-06-06T10:00:00.000Z',
    threadTag: 'general',
    ...overrides,
  }
}

describe('explore manifest builder', () => {
  it('parses path from input summary', () => {
    expect(parsePathFromInputSummary('path=src/a.ts, pattern=foo')).toBe(
      'src/a.ts',
    )
  })

  it('parses optional pattern/query/url fields', () => {
    expect(parsePatternFromInputSummary('pattern=foo.*, path=src')).toBe('foo.*')
    expect(parseQueryFromInputSummary('query=agent planning, path=.')).toBe(
      'agent planning',
    )
    expect(parseUrlFromInputSummary('url=https://example.com/docs, path=.')).toBe(
      'https://example.com/docs',
    )
    expect(parseQueryFromInputSummary('path=src')).toBeUndefined()
  })

  it('converts html snippets to plain text and strips scripts/styles', () => {
    const html =
      '<style>.x{color:red}</style><script>alert(1)</script><h1>Title</h1><p>Alpha  Beta</p>'
    expect(htmlToTextSnippet(html, 10)).toBe('Title Alph')
  })

  it('scopes explore results to session after enter_plan_mode', () => {
    const results = [
      toolResult({
        toolName: 'read_file',
        outputText: '{"path":"old.ts","content":"x"}',
        createdAt: '2026-06-06T09:00:00.000Z',
      }),
      toolResult({
        toolName: 'enter_plan_mode',
        outputText: '{"ok":true}',
        createdAt: '2026-06-06T09:30:00.000Z',
      }),
      toolResult({
        toolName: 'read_file',
        inputSummary: 'path=src/new.ts',
        outputText: '{"path":"src/new.ts","content":"export const x = 1"}',
        createdAt: '2026-06-06T10:00:00.000Z',
      }),
    ]
    expect(resolveExploreSessionStartAt(results)).toBe(
      '2026-06-06T09:30:00.000Z',
    )
    expect(filterExplorePhaseToolResults(results)).toHaveLength(1)
    expect(filterExplorePhaseToolResults(results)[0]?.toolName).toBe('read_file')
  })

  it('dedupes read_file paths and caps snippet length', () => {
    const body = 'a'.repeat(600)
    const results = [
      toolResult({
        toolName: 'read_file',
        inputSummary: 'path=./src/a.ts',
        outputText: JSON.stringify({ path: 'src/a.ts', content: body }),
        createdAt: '2026-06-06T10:00:00.000Z',
      }),
      toolResult({
        toolName: 'read_file',
        inputSummary: 'path=src/a.ts',
        outputText: JSON.stringify({ path: 'src/a.ts', content: 'duplicate' }),
        createdAt: '2026-06-06T10:01:00.000Z',
      }),
    ]

    const manifest = buildExploreManifestFromToolResults({
      conversationId: 'conv-1',
      planSlug: 'test-plan',
      results,
      pathContext: { sandboxRoot: '/proj', workspacePath: '/proj' },
      updatedAt: '2026-06-06T10:02:00.000Z',
    })

    expect(manifest.files).toHaveLength(1)
    expect(manifest.files[0]?.path).toContain('a.ts')
    expect(manifest.files[0]?.snippet?.length).toBe(500)
  })

  it('captures read_file directory entries and modified timestamp when present', () => {
    const manifest = buildExploreManifestFromToolResults({
      conversationId: 'conv-1',
      planSlug: 'test-plan',
      results: [
        toolResult({
          toolName: 'read_file',
          inputSummary: 'path=src',
          outputText: JSON.stringify({
            path: 'src',
            isDirectory: true,
            entries: ['a.ts', 'b.ts'],
          }),
        }),
        toolResult({
          toolName: 'read_file',
          inputSummary: 'path=src/a.ts',
          outputText: JSON.stringify({
            path: 'src/a.ts',
            content: 'export const a = 1',
            modifiedAt: '2026-06-01T10:00:00.000Z',
          }),
        }),
      ],
      pathContext: { sandboxRoot: '/proj', workspacePath: '/proj' },
    })

    expect(manifest.files[0]).toMatchObject({
      path: expect.stringContaining('src'),
      isDirectory: true,
      entryCount: 2,
    })
    expect(manifest.files[1]?.mtimeMs).toBeTypeOf('number')
  })

  it('includes grep and glob search entries', () => {
    const manifest = buildExploreManifestFromToolResults({
      conversationId: 'conv-1',
      planSlug: 'test-plan',
      results: [
        toolResult({
          toolName: 'grep_files',
          inputSummary: 'pattern=foo, path=src',
          outputText: JSON.stringify({ matches: [{}, {}] }),
        }),
        toolResult({
          toolName: 'glob_files',
          inputSummary: 'pattern=**/*.ts, path=.',
          outputText: JSON.stringify({ files: ['a.ts', 'b.ts', 'c.ts'] }),
        }),
      ],
      pathContext: { sandboxRoot: '/proj', workspacePath: '/proj' },
    })

    expect(manifest.searches).toHaveLength(2)
    expect(manifest.searches?.[0]).toMatchObject({
      tool: 'grep_files',
      pattern: 'foo',
      hitCount: 2,
    })
  })

  it('skips failed tool outputs and falls back to output-supplied patterns', () => {
    const manifest = buildExploreManifestFromToolResults({
      conversationId: 'conv-1',
      planSlug: 'test-plan',
      results: [
        toolResult({
          toolName: 'grep_files',
          inputSummary: 'path=src',
          outputText: JSON.stringify({ pattern: 'fallback', count: 7 }),
        }),
        toolResult({
          toolName: 'web_search',
          inputSummary: 'query=bad',
          outputText: JSON.stringify({ success: false, error: 'boom' }),
        }),
      ],
    })

    expect(manifest.searches?.[0]).toMatchObject({ pattern: 'fallback', hitCount: 7 })
    expect(manifest.resources ?? []).toHaveLength(0)
  })

  it('includes web scrape and search resources', () => {
    const manifest = buildExploreManifestFromToolResults({
      conversationId: 'conv-1',
      planSlug: 'test-plan',
      results: [
        toolResult({
          toolName: 'web_search',
          inputSummary: 'query=teralexi agent',
          outputText: JSON.stringify({
            success: true,
            query: 'teralexi agent',
            resultCount: 2,
            results: [
              {
                title: 'Docs',
                url: 'https://example.com/docs',
                snippet: 'Agent framework overview',
              },
            ],
          }),
        }),
        toolResult({
          toolName: 'web_scrape',
          inputSummary: 'url=https://example.com/api',
          outputText: JSON.stringify({
            success: true,
            pageCount: 1,
            pages: [
              {
                url: 'https://example.com/api',
                title: 'API Reference',
                html: '<h1>API</h1><p>GET /health returns ok</p>',
              },
            ],
          }),
        }),
        toolResult({
          toolName: 'deep_research',
          inputSummary: 'query=transformer attention',
          outputText: JSON.stringify({
            success: true,
            query: 'transformer attention',
            scopeLabel: 'scholarly articles',
            resultCount: 1,
            results: [
              {
                title: 'Attention Is All You Need',
                url: 'https://scholar.example/paper',
              },
            ],
          }),
        }),
      ],
    })

    expect(manifest.resources).toHaveLength(3)
    expect(manifest.resources?.[0]).toMatchObject({
      kind: 'web_search',
      query: 'teralexi agent',
      topUrls: ['https://example.com/docs'],
    })
    expect(manifest.resources?.[1]).toMatchObject({
      kind: 'web_scrape',
      url: 'https://example.com/api',
      title: 'API Reference',
    })
    expect(manifest.resources?.[1]?.snippet).toContain('GET /health')
    expect(manifest.resources?.[2]).toMatchObject({
      kind: 'deep_research',
      query: 'transformer attention',
      scopeLabel: 'scholarly articles',
    })
  })

  it('formats manifest for todo execution instructions', () => {
    const text = formatExploreManifestForInstructions({
      version: 1,
      updatedAt: '2026-06-06T10:00:00.000Z',
      conversationId: 'conv-1',
      planSlug: 'plan',
      files: [
        {
          path: 'src/main.ts',
          snippet: 'export function main() {}',
        },
      ],
      searches: [
        {
          tool: 'grep_files',
          pattern: 'main',
          root: 'src',
          hitCount: 1,
        },
      ],
      resources: [
        {
          kind: 'web_scrape',
          url: 'https://example.com/docs',
          title: 'Docs',
          snippet: 'Overview of the API',
        },
      ],
    })

    expect(text).toContain('Explore manifest')
    expect(text).toContain('Remote resources researched')
    expect(text).toContain('https://example.com/docs')
    expect(text).toContain('src/main.ts')
    expect(text).toContain('export function main()')
    expect(text).toContain('grep_files')
    expect(text).toContain('Do not `read_file`')
  })

  it('formats directory/search/deep-research details and truncates long output', () => {
    const manifest = {
      version: 1,
      updatedAt: '2026-06-06T10:00:00.000Z',
      conversationId: 'conv-1',
      planSlug: 'plan',
      files: [
        { path: 'src', isDirectory: true, entryCount: 3 },
        { path: 'src/a.ts', snippet: 'x'.repeat(120) },
      ],
      searches: [
        { tool: 'glob_files', pattern: '**/*.ts', root: '.', hitCount: 4 },
      ],
      resources: [
        {
          kind: 'deep_research' as const,
          query: 'llm safety',
          scopeLabel: 'papers',
          resultCount: 2,
          topUrls: ['https://example.com/a', 'https://example.com/b'],
          snippet: 'summary',
        },
      ],
    }

    const fullText = formatExploreManifestForInstructions(manifest)
    expect(fullText).toContain('(directory, 3 entries)')
    expect(fullText).toContain('glob_files')
    expect(fullText).toContain('URLs: https://example.com/a, https://example.com/b')

    const truncated = formatExploreManifestForInstructions(
      manifest,
      { maxChars: 220 },
    )
    expect(truncated).toContain('[manifest truncated]')
  })
})
