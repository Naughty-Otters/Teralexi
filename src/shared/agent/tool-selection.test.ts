import { describe, expect, it } from 'vitest'
import { RUN_SCRIPT_TOOLS } from '@shared/constants'
import {
  expandRunScriptApprovalOverrides,
  filterToolsByAvailableSet,
  hasToolEnabledWithLegacySupport,
  isSplitRunScriptTool,
  isToolEnabledInAvailableSet,
  reconcileAvailableSetWithCatalog,
  resolveSkillAvailableSet,
  RUN_SCRIPT_LEGACY_TOOL,
} from '@shared/agent/tool-selection'

describe('isSplitRunScriptTool', () => {
  it('returns true for split run_script tools', () => {
    expect(isSplitRunScriptTool(RUN_SCRIPT_TOOLS.CONTENT)).toBe(true)
    expect(isSplitRunScriptTool(RUN_SCRIPT_TOOLS.FILE)).toBe(true)
  })

  it('returns true for legacy name (same as CONTENT)', () => {
    expect(isSplitRunScriptTool(RUN_SCRIPT_TOOLS.LEGACY)).toBe(true)
  })

  it('returns false for other tools', () => {
    expect(isSplitRunScriptTool('read_file')).toBe(false)
  })
})

describe('hasToolEnabledWithLegacySupport', () => {
  it('matches direct selection', () => {
    const set = new Set(['read_file'])
    expect(hasToolEnabledWithLegacySupport(set, 'read_file')).toBe(true)
  })

  it('enables split tools when legacy run_script is selected', () => {
    const set = new Set([RUN_SCRIPT_LEGACY_TOOL])
    expect(hasToolEnabledWithLegacySupport(set, RUN_SCRIPT_TOOLS.CONTENT)).toBe(
      true,
    )
    expect(hasToolEnabledWithLegacySupport(set, RUN_SCRIPT_TOOLS.FILE)).toBe(true)
    expect(hasToolEnabledWithLegacySupport(set, 'read_file')).toBe(false)
  })
})

describe('expandRunScriptApprovalOverrides', () => {
  it('copies legacy flag to split tools when unset', () => {
    const out = expandRunScriptApprovalOverrides({
      [RUN_SCRIPT_LEGACY_TOOL]: true,
    })
    expect(out.run_script).toBe(true)
    expect(out.run_script_file).toBe(true)
  })

  it('does not override explicit split tool flags', () => {
    const out = expandRunScriptApprovalOverrides({
      [RUN_SCRIPT_LEGACY_TOOL]: true,
      run_script_file: false,
    })
    expect(out.run_script).toBe(true)
    expect(out.run_script_file).toBe(false)
  })

  it('leaves map unchanged when legacy absent', () => {
    const input = { read_file: true }
    expect(expandRunScriptApprovalOverrides(input)).toEqual(input)
  })
})

describe('filterToolsByAvailableSet', () => {
  const tools = [
    { name: 'a' },
    { name: RUN_SCRIPT_TOOLS.CONTENT },
    { name: 'b' },
  ]

  it('returns all tool names when available set not touched', () => {
    expect(
      filterToolsByAvailableSet(tools, {
        availableSetTouched: false,
        selectedNames: new Set(),
      }),
    ).toEqual(['a', RUN_SCRIPT_TOOLS.CONTENT, 'b'])
  })

  it('filters by selected names with legacy support', () => {
    expect(
      filterToolsByAvailableSet(tools, {
        availableSetTouched: true,
        selectedNames: new Set([RUN_SCRIPT_LEGACY_TOOL]),
      }),
    ).toEqual([RUN_SCRIPT_TOOLS.CONTENT])
  })
})

describe('RUN_SCRIPT_LEGACY_TOOL', () => {
  it('matches shared legacy constant', () => {
    expect(RUN_SCRIPT_LEGACY_TOOL).toBe(RUN_SCRIPT_TOOLS.LEGACY)
  })
})

describe('isToolEnabledInAvailableSet', () => {
  it('enables all tools when AvailableSet was not customized', () => {
    expect(
      isToolEnabledInAvailableSet('git_status', {
        availableSetTouched: false,
        availableSet: [],
      }),
    ).toBe(true)
  })

  it('respects saved whitelist when customized', () => {
    expect(
      isToolEnabledInAvailableSet('git_status', {
        availableSetTouched: true,
        availableSet: ['read_file'],
      }),
    ).toBe(false)
  })

  it('keeps mandatory tools enabled when customized', () => {
    expect(
      isToolEnabledInAvailableSet('update_todos', {
        availableSetTouched: true,
        availableSet: ['read_file'],
      }),
    ).toBe(true)
  })
})

describe('reconcileAvailableSetWithCatalog', () => {
  const catalog = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]

  it('returns full catalog when untouched', () => {
    expect(
      reconcileAvailableSetWithCatalog(catalog, {
        availableSetTouched: false,
        savedAvailableSet: ['a'],
      }),
    ).toEqual(['a', 'b', 'c'])
  })

  it('drops removed tools and keeps saved selection when touched', () => {
    expect(
      reconcileAvailableSetWithCatalog(catalog, {
        availableSetTouched: true,
        savedAvailableSet: ['a', 'removed', 'c'],
      }),
    ).toEqual(['a', 'c'])
  })

  it('always retains mandatory tools from catalog when touched', () => {
    expect(
      reconcileAvailableSetWithCatalog(
        [{ name: 'read_file' }, { name: 'enter_plan_mode' }],
        {
          availableSetTouched: true,
          savedAvailableSet: ['read_file'],
        },
      ),
    ).toEqual(['read_file', 'enter_plan_mode'])
  })
})

describe('resolveSkillAvailableSet', () => {
  const catalog = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]

  it('uses skill allowed_tools when user has not customized', () => {
    expect(
      resolveSkillAvailableSet(catalog, {
        skillAllowedTools: ['a', 'c', 'missing'],
      }),
    ).toEqual({
      availableSet: ['a', 'c'],
      availableSetTouched: true,
    })
  })

  it('always enables skill action tools with allowed_tools defaults', () => {
    expect(
      resolveSkillAvailableSet(catalog, {
        skillAllowedTools: ['a'],
        skillActionToolNames: ['c', 'missing'],
      }),
    ).toEqual({
      availableSet: ['a', 'c'],
      availableSetTouched: true,
    })
  })

  it('keeps saved whitelist when user customized', () => {
    expect(
      resolveSkillAvailableSet(catalog, {
        skillAllowedTools: ['a'],
        savedAvailableSet: ['b'],
        availableSetTouched: true,
      }),
    ).toEqual({
      availableSet: ['b'],
      availableSetTouched: true,
    })
  })

  it('enables all tools when user explicitly saved full catalog', () => {
    expect(
      resolveSkillAvailableSet(catalog, {
        skillAllowedTools: ['a'],
        savedAvailableSet: ['a', 'b', 'c'],
        availableSetTouched: false,
      }),
    ).toEqual({
      availableSet: ['a', 'b', 'c'],
      availableSetTouched: false,
    })
  })

  it('falls back to untouched all tools when skill has no allowed_tools', () => {
    expect(
      resolveSkillAvailableSet(catalog, {
        availableSetTouched: false,
      }),
    ).toEqual({
      availableSet: ['a', 'b', 'c'],
      availableSetTouched: false,
    })
  })
})
