import { describe, expect, it } from 'vitest'
import {
  SUBAGENT_PROFILES,
  applySubagentProfileToTask,
  filterMcpToolsForSubagentAccess,
  formatBuiltinSubagentPriorityInstructions,
  isBrowserMcpToolName,
  resolveSubagentProfile,
} from './subagent-profiles'

describe('subagent-profiles', () => {
  it('defines Cursor built-ins plus orchestration profiles', () => {
    expect(Object.keys(SUBAGENT_PROFILES).sort()).toEqual([
      'architect',
      'bash',
      'browser',
      'coder',
      'explore',
    ])
    expect(SUBAGENT_PROFILES.explore.agentId).toBe('skill:coding')
    expect(SUBAGENT_PROFILES.coder.allowedTools).toBe('all')
    expect(SUBAGENT_PROFILES.explore.priorityBuiltin).toBe(true)
    expect(SUBAGENT_PROFILES.bash.priorityBuiltin).toBe(true)
    expect(SUBAGENT_PROFILES.browser.priorityBuiltin).toBe(true)
    expect(SUBAGENT_PROFILES.architect.priorityBuiltin).toBe(false)
  })

  it('restricts explore profile to read-only tools', () => {
    const tools = SUBAGENT_PROFILES.explore.allowedTools
    expect(Array.isArray(tools)).toBe(true)
    if (Array.isArray(tools)) {
      expect(tools).toContain('read_file')
      expect(tools).toContain('lsp')
      expect(tools).toContain('shell')
      expect(tools).not.toContain('edit_files')
      expect(tools).not.toContain('write_file')
    }
  })

  it('restricts bash profile to command tools without file edits', () => {
    const tools = SUBAGENT_PROFILES.bash.allowedTools
    expect(Array.isArray(tools)).toBe(true)
    if (Array.isArray(tools)) {
      expect(tools).toContain('shell')
      expect(tools).not.toContain('run_script')
      expect(tools).not.toContain('edit_files')
      expect(tools).not.toContain('edit_file')
    }
    expect(SUBAGENT_PROFILES.bash.mcpAccess).toBe('none')
  })

  it('browser profile allows scrape/search and browser MCP only', () => {
    const tools = SUBAGENT_PROFILES.browser.allowedTools
    expect(Array.isArray(tools)).toBe(true)
    if (Array.isArray(tools)) {
      expect(tools).toContain('web_scrape')
      expect(tools).toContain('web_search')
      expect(tools).toContain('edit_files')
      expect(tools).not.toContain('list_files')
    }
    expect(SUBAGENT_PROFILES.browser.mcpAccess).toBe('browser')
  })

  it('explore profile stays within lean coding tools', () => {
    const tools = SUBAGENT_PROFILES.explore.allowedTools
    expect(Array.isArray(tools)).toBe(true)
    if (Array.isArray(tools)) {
      expect(tools).not.toContain('grep_files')
      expect(tools).not.toContain('git_status')
      expect(tools).toContain('lsp')
    }
  })

  it('adds todo tools for architect profile', () => {
    const exploreTools = SUBAGENT_PROFILES.explore.allowedTools
    const architectTools = SUBAGENT_PROFILES.architect.allowedTools
    expect(Array.isArray(exploreTools)).toBe(true)
    expect(Array.isArray(architectTools)).toBe(true)
    if (Array.isArray(exploreTools) && Array.isArray(architectTools)) {
      expect(architectTools).toEqual(
        expect.arrayContaining([...exploreTools, 'read_todos', 'update_todos']),
      )
    }
  })

  it('resolves profile types including legacy plan alias', () => {
    expect(resolveSubagentProfile('explore')?.label).toBe('Explore')
    expect(resolveSubagentProfile('bash')?.label).toBe('Bash')
    expect(resolveSubagentProfile('browser')?.label).toBe('Browser')
    expect(resolveSubagentProfile('plan')?.type).toBe('architect')
    expect(resolveSubagentProfile('coder')?.taskPrefix).toBe('[Coder] ')
    expect(resolveSubagentProfile('unknown')).toBeNull()
  })

  it('applySubagentProfileToTask prefixes task and sets Cursor-style constraints', () => {
    const explore = resolveSubagentProfile('explore')!
    const applied = applySubagentProfileToTask(explore, 'Where is auth?')
    expect(applied.task).toBe('[Explore] Where is auth?')
    expect(applied.slimContext).toBe(true)
    expect(applied.isolateGitWorktree).toBe(false)
    expect(applied.mcpAccess).toBe('none')
    expect(applied.systemPromptAddendum).toContain('Explore sub-agent')
    expect(Array.isArray(applied.allowedToolNames)).toBe(true)
  })

  it('filters MCP tools for browser access', () => {
    const tools = [
      { name: 'browser_navigate', serverId: 'playwright' },
      { name: 'db_query', serverId: 'postgres' },
      { name: 'take_screenshot', serverId: 'chrome-devtools' },
    ]
    expect(filterMcpToolsForSubagentAccess(tools, 'none')).toEqual([])
    expect(filterMcpToolsForSubagentAccess(tools, 'all')).toEqual(tools)
    expect(filterMcpToolsForSubagentAccess(tools, 'browser').map((t) => t.name)).toEqual([
      'browser_navigate',
      'take_screenshot',
    ])
    expect(isBrowserMcpToolName('click_element', 'puppeteer')).toBe(true)
    expect(isBrowserMcpToolName('list_tables', 'sql')).toBe(false)
  })

  it('formats priority routing instructions for built-ins', () => {
    const text = formatBuiltinSubagentPriorityInstructions()
    expect(text).toContain('`explore`')
    expect(text).toContain('`bash`')
    expect(text).toContain('`browser`')
    expect(text).toContain('prefer these before')
  })
})
