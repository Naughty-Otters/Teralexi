import { describe, expect, it } from 'vitest'
import {
  applyThinkingReadonlyPolicy,
  resolveThinkingReadonlyToolNames,
  THINKING_READONLY_TOOL_NAMES,
} from './thinking-readonly-tools'

describe('thinking-readonly-tools', () => {
  it('includes read-only plan mode tools', () => {
    expect(THINKING_READONLY_TOOL_NAMES.has('read_file')).toBe(true)
    expect(THINKING_READONLY_TOOL_NAMES.has('lsp')).toBe(true)
    expect(THINKING_READONLY_TOOL_NAMES.has('web_search')).toBe(true)
  })

  it('excludes mutating and plan control tools', () => {
    expect(THINKING_READONLY_TOOL_NAMES.has('edit_files')).toBe(false)
    expect(THINKING_READONLY_TOOL_NAMES.has('update_todos')).toBe(false)
    expect(THINKING_READONLY_TOOL_NAMES.has('enter_plan_mode')).toBe(false)
    expect(THINKING_READONLY_TOOL_NAMES.has('exit_plan_mode')).toBe(false)
    expect(THINKING_READONLY_TOOL_NAMES.has('run_script')).toBe(false)
    expect(THINKING_READONLY_TOOL_NAMES.has('shell')).toBe(false)
  })

  it('filters tool names to readonly set', () => {
    const names = resolveThinkingReadonlyToolNames([
      'read_file',
      'edit_files',
      'run_script',
      'web_search',
    ])
    expect(names).toEqual(['read_file', 'web_search'])
  })

  it('applyThinkingReadonlyPolicy removes disallowed tools', () => {
    const toolSet: Record<string, unknown> = {
      read_file: {},
      run_script: {},
    }
    applyThinkingReadonlyPolicy(toolSet)
    expect(Object.keys(toolSet)).toEqual(['read_file'])
  })
})
