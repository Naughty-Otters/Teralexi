import { describe, expect, it } from 'vitest'
import {
  resolveSkillToolCatalog,
  skillActionTag,
  tagToolsForSkill,
} from './resolve-skill-tools'
import type { SkillTool } from './types'

function stubTool(name: string, tags?: string[]): SkillTool {
  return {
    name,
    description: name,
    tags,
    async execute() {
      return null
    },
  }
}

describe('resolveSkillToolCatalog', () => {
  const global = [
    stubTool('read_file'),
    stubTool('google_gmail_send'),
    stubTool('web_search'),
  ]

  it('includes only allowed global tools plus skill actions', () => {
    const actions = [stubTool('create_spreadsheet')]
    const catalog = resolveSkillToolCatalog(global, actions, [
      'read_file',
      'write_file',
    ])
    expect(catalog.map((t) => t.name)).toEqual([
      'read_file',
      'create_spreadsheet',
    ])
  })

  it('always includes plan mode and core sub-agent tools even when not in allowed_tools', () => {
    const globalWithUniversal = [
      ...global,
      stubTool('enter_plan_mode'),
      stubTool('exit_plan_mode'),
      stubTool('invoke_agents'),
    ]
    const catalog = resolveSkillToolCatalog(globalWithUniversal, [], ['read_file'])
    expect(catalog.map((t) => t.name)).toEqual([
      'read_file',
      'enter_plan_mode',
      'exit_plan_mode',
      'invoke_agents',
    ])
    expect(catalog.map((t) => t.name)).not.toContain('web_search')
  })

  it('default skill omits plan-mode file reads from universal catalog', () => {
    const globalWithUniversal = [
      stubTool('read_file'),
      stubTool('web_search'),
      stubTool('shell'),
      stubTool('enter_plan_mode'),
      stubTool('invoke_agents'),
    ]
    const catalog = resolveSkillToolCatalog(
      globalWithUniversal,
      [],
      ['shell', 'web_search'],
      'default',
    )
    expect(catalog.map((t) => t.name)).toEqual([
      'web_search',
      'shell',
      'enter_plan_mode',
      'invoke_agents',
    ])
  })

  it('includes all global tools when allowed_tools is unset', () => {
    const actions = [stubTool('create_spreadsheet')]
    const catalog = resolveSkillToolCatalog(global, actions)
    expect(catalog.map((t) => t.name)).toEqual([
      'read_file',
      'google_gmail_send',
      'web_search',
      'create_spreadsheet',
    ])
  })
})

describe('tagToolsForSkill', () => {
  it('adds skill-scoped tag', () => {
    const tagged = tagToolsForSkill([stubTool('create_spreadsheet')], 'documents')
    expect(tagged[0]?.tags).toContain(skillActionTag('documents'))
  })
})
