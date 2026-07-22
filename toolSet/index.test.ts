import { describe, expect, it } from 'vitest'
import toolSet, { tools } from './index'

const CATALOG = [
  'read_file',
  'edit_files',
  'shell',
  'promote_artifact',
  'run_script',
  'run_script_file',
  'read_todos',
  'update_todos',
  'generate_follow_up',
  'enter_plan_mode',
  'exit_plan_mode',
  'invoke_agents',
  'lsp',
  'web_search',
  'web_scrape',
] as const

describe('toolSet index', () => {
  it('exports default module with the shared catalog', () => {
    expect(toolSet.tools).toBe(tools)
    expect(tools.map((t) => t.name).sort()).toEqual([...CATALOG].sort())
    expect(tools.map((t) => t.name)).toContain('run_script')
    expect(tools.map((t) => t.name)).toContain('run_script_file')
    expect(tools.map((t) => t.name)).toContain('shell')
    expect(tools.map((t) => t.name)).not.toContain('best_of_n')
    expect(tools.map((t) => t.name)).not.toContain('git_status')
    expect(tools.map((t) => t.name)).not.toContain('run_workspace_command')
    expect(tools.map((t) => t.name)).not.toContain('edit_file')
    expect(tools.map((t) => t.name)).not.toContain('invoke_agent')
  })
})
