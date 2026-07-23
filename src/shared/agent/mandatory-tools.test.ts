import { describe, expect, it } from 'vitest'
import {
  APPROVAL_REQUIRED_BY_DEFAULT_TOOL_NAMES,
  isApprovalRequiredByDefault,
  isMandatoryTool,
  MANDATORY_TOOL_NAMES,
  withMandatoryToolsInCatalog,
} from './mandatory-tools'
import {
  isToolEnabledInAvailableSet,
  reconcileAvailableSetWithCatalog,
} from './tool-selection'

describe('mandatory tools', () => {
  it('includes planning, todos, invoke, promote, follow-up, and workspace tools', () => {
    expect(MANDATORY_TOOL_NAMES.has('read_todos')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('update_todos')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('enter_plan_mode')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('exit_plan_mode')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('invoke_agents')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('invoke_agent')).toBe(false)
    expect(MANDATORY_TOOL_NAMES.has('wait_for_sub_agent_runs')).toBe(false)
    expect(MANDATORY_TOOL_NAMES.has('best_of_n')).toBe(false)
    expect(MANDATORY_TOOL_NAMES.has('promote_artifact')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('generate_follow_up')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('edit_files')).toBe(true)
    expect(MANDATORY_TOOL_NAMES.has('shell')).toBe(true)
  })

  it('sub-agent delegation tools are always enabled when customized off-list', () => {
    expect(
      isToolEnabledInAvailableSet('invoke_agents', {
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
      isToolEnabledInAvailableSet('edit_files', {
        availableSetTouched: true,
        availableSet: ['read_file'],
      }),
    ).toBe(true)
    expect(
      isToolEnabledInAvailableSet('shell', {
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

  it('marks shell and edit_files as approval-required by default', () => {
    expect(APPROVAL_REQUIRED_BY_DEFAULT_TOOL_NAMES.has('shell')).toBe(true)
    expect(APPROVAL_REQUIRED_BY_DEFAULT_TOOL_NAMES.has('edit_files')).toBe(true)
    expect(isApprovalRequiredByDefault('read_file')).toBe(false)
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
