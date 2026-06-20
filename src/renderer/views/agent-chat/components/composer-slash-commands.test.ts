import { describe, expect, it } from 'vitest'
import {
  filterSlashCommands,
  formatSlashHelp,
  slashCommandsForAgent,
} from './composer-slash-commands'

describe('filterSlashCommands', () => {
  it('returns universal commands plus explore/yolo for non-coding agents', () => {
    expect(filterSlashCommands('').map((c) => c.name)).toEqual([
      'compact',
      'help',
      'workspace',
      'agent',
      'explore',
      'yolo',
    ])
    expect(filterSlashCommands('', false, true).map((c) => c.name)).toEqual([
      'compact',
      'help',
      'workspace',
      'agent',
      'sub-agent',
      'explore',
      'yolo',
    ])
    expect(filterSlashCommands('explore').map((c) => c.name)).toEqual(['explore'])
    expect(filterSlashCommands('plan').map((c) => c.name)).toEqual([])
    expect(filterSlashCommands('yolo').map((c) => c.name)).toEqual(['yolo'])
  })

  it('returns coding commands only for coding agent', () => {
    expect(filterSlashCommands('', true).map((c) => c.name)).toEqual(
      slashCommandsForAgent(true).map((c) => c.name),
    )
    expect(filterSlashCommands('explore', true).map((c) => c.name)).toEqual([
      'explore',
    ])
    expect(filterSlashCommands('comp', true).map((c) => c.name)).toEqual(['compact'])
  })

  it('formats help scoped to agent type', () => {
    expect(formatSlashHelp(false)).toContain('/compact')
    expect(formatSlashHelp(false)).toContain('/explore')
    expect(formatSlashHelp(false)).toContain('/yolo')
    expect(formatSlashHelp(false)).not.toContain('/plan')
    expect(formatSlashHelp(false)).toContain('/workspace')
    expect(formatSlashHelp(false)).toContain('/agent')
    expect(formatSlashHelp(false, [])).toContain('/skill:<id>')
    expect(formatSlashHelp(false, [], [{ id: 'a', name: 'A', description: 'A', mentionSlug: 'a' }])).toContain(
      '/sub-agent @<slug>',
    )
    expect(formatSlashHelp(true)).toContain('/explore')
    expect(formatSlashHelp(true)).toContain('/mcp')
  })
})
