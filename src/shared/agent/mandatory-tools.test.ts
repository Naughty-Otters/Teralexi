import { describe, expect, it } from 'vitest'
import {
  isMandatoryTool,
  MANDATORY_TOOL_NAMES,
  withMandatoryToolsInCatalog,
} from './mandatory-tools'
import {
  isToolEnabledInAvailableSet,
  reconcileAvailableSetWithCatalog,
} from './tool-selection'

describe('mandatory tools', () => {
  it('includes planning, todos, invoke, promote, and follow-up tools', () => {
    expect(MANDATORY_TOOL_NAMES.has('read_todos')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('update_todos')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('enter_plan_mode')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('exit_plan_mode')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('invoke_agent')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('invoke_agents')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('wait_for_sub_agent_runs')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('best_of_n')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('promote_artifact')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('generate_follow_up')).toBe(true)
  })

  it('sub-agent delegation tools are always enabled when customized off-list', () => {
    expect(
      isToolEnabledInAvailableSet('invoke_agent', {
        availableSetTouched: true,
        availableSet: ['read_file'],
      }),
    ).toBe(true)
  })

  it('is always enabled in available set UI even when customized off-list', () => {
    expect(
      isToolEnabledInAvailableSet('enter_plan_mode', {
        availableSetTouched: true,
        availableSet: ['read_file'],
      }),
    ).toBe(true)
    expect(
      isToolEnabledInAvailableSet('grep_files', {
        availableSetTouched: true,
        availableSet: ['read_file'],
      }),
    ).toBe(false)
  })

  it('reconcile keeps mandatory tools in a customized available set', () => {
    const catalog = [
      { name: 'read_file' },
      { name: 'enter_plan_mode' },
      { name: 'grep_files' },
    ]
    expect(
      reconcileAvailableSetWithCatalog(catalog, {
        availableSetTouched: true,
        savedAvailableSet: ['read_file'],
      }),
    ).toEqual(['read_file', 'enter_plan_mode'])
  })

  it('withMandatoryToolsInCatalog merges only catalog members', () => {
    expect(
      withMandatoryToolsInCatalog(
        [{ name: 'read_todos' }, { name: 'read_file' }],
        ['read_file'],
      ),
    ).toEqual(['read_file', 'read_todos'])
    expect(isMandatoryTool('promote_artifact')).toBe(true)
  })
})
