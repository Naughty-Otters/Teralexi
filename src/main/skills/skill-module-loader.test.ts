import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    mkdirSync: vi.fn(actual.mkdirSync),
    readdirSync: vi.fn(actual.readdirSync),
    readFileSync: vi.fn(actual.readFileSync),
    statSync: vi.fn(actual.statSync),
  }
})

import { existsSync } from 'fs'

vi.mock('./bundled-toolset', () => ({
  getBundledToolSetTools: vi.fn(() => [
    {
      name: 'bundled_tool',
      description: 'bundled',
      execute: async () => null,
    },
  ]),
}))

vi.mock('./skill-path', () => ({
  resolveUserToolSetDirectory: vi.fn(() => '/nonexistent/user/toolSet'),
}))

import { getBundledToolSetTools } from './bundled-toolset'
import { resolveUserToolSetDirectory } from './skill-path'
import {
  loadSkillActions,
  loadToolSetTools,
  loadToolSetToolsFromDirectory,
  resetToolSetCatalogCache,
} from './skill-module-loader'

describe('skill-module-loader', () => {
  let skillRoot: string

  beforeEach(async () => {
    resetToolSetCatalogCache()
    vi.mocked(existsSync).mockImplementation(
      (await vi.importActual<typeof import('fs')>('fs')).existsSync,
    )
    vi.mocked(getBundledToolSetTools).mockReturnValue([
      {
        name: 'bundled_tool',
        description: 'bundled',
        execute: async () => null,
      },
    ])
    vi.mocked(resolveUserToolSetDirectory).mockReturnValue(
      '/nonexistent/user/toolSet',
    )
    skillRoot = await mkdtemp(join(tmpdir(), 'skill-loader-'))
  })

  it('loadSkillActions returns empty without actions dir', async () => {
    expect(await loadSkillActions(skillRoot, [])).toEqual([])
  })

  it('loadToolSetToolsFromDirectory loads tools from index module', async () => {
    const toolSetDir = join(skillRoot, 'toolSet')
    await mkdir(toolSetDir, { recursive: true })
    await writeFile(
      join(toolSetDir, 'index.js'),
      `module.exports = { tools: [{ name: 'idx', description: 'from index', execute: async () => {} }] }`,
    )
    const tools = await loadToolSetToolsFromDirectory(toolSetDir)
    expect(tools).toHaveLength(1)
    expect(tools[0]?.name).toBe('idx')
    expect(tools[0]?.tags).toContain('toolSet')
  })

  it('loadToolSetToolsFromDirectory returns empty without toolSet dir', async () => {
    expect(await loadToolSetToolsFromDirectory(join(skillRoot, 'toolSet'))).toEqual(
      [],
    )
  })

  it('loadSkillActions loads tools from nested actions subfolders', async () => {
    const actionsDir = join(skillRoot, 'actions', 'office')
    await mkdir(actionsDir, { recursive: true })
    await writeFile(
      join(actionsDir, 'sheet.js'),
      `exports.tools = [{
        name: 'nested_sheet_tool',
        description: 'nested',
        execute: async () => 'ok'
      }]`,
      'utf8',
    )

    const tools = await loadSkillActions(skillRoot, [])
    expect(tools.map((t) => t.name)).toEqual(['nested_sheet_tool'])
  })

  it('loadSkillActions loads tools from actions/index.ts without treating the directory as a module', async () => {
    const actionsDir = join(skillRoot, 'actions')
    await mkdir(actionsDir, { recursive: true })
    await writeFile(
      join(actionsDir, 'index.ts'),
      `export const tools = [{
        name: 'gw_tool',
        description: 'google workspace',
        execute: async () => 'ok'
      }]`,
      'utf8',
    )

    const tools = await loadSkillActions(skillRoot, ['gw_tool'])
    expect(tools.map((t) => t.name)).toEqual(['gw_tool'])
  })

  it('loadSkillActions loads tools from actions/*.js', async () => {
    const actionsDir = join(skillRoot, 'actions')
    await mkdir(actionsDir, { recursive: true })
    await writeFile(
      join(actionsDir, 'demo.js'),
      `exports.tools = [{
        name: 'demo_tool',
        description: 'demo',
        execute: async () => 'ok'
      }]`,
      'utf8',
    )

    const tools = await loadSkillActions(skillRoot, ['demo_tool'])
    expect(tools.map((t) => t.name)).toEqual(['demo_tool'])
  })

  it('loadToolSetTools applies default tag when tool has no tags', async () => {
    const toolSetDir = join(skillRoot, 'toolSet')
    await mkdir(toolSetDir, { recursive: true })
    await writeFile(
      join(toolSetDir, 'misc.js'),
      `exports.tools = [{
        name: 'misc_tool',
        description: 'misc',
        execute: async () => null
      }]`,
      'utf8',
    )

    const tools = await loadToolSetToolsFromDirectory(join(skillRoot, 'toolSet'))
    expect(tools[0].tags).toEqual(['misc'])
  })

  it('loadToolSetTools merges bundled tools with user overrides', async () => {
    const userToolSetDir = join(skillRoot, 'user-toolSet')
    await mkdir(userToolSetDir, { recursive: true })
    await writeFile(
      join(userToolSetDir, 'override.js'),
      `exports.tools = [{
        name: 'user_tool',
        description: 'user',
        execute: async () => null
      }]`,
      'utf8',
    )
    vi.mocked(resolveUserToolSetDirectory).mockReturnValue(userToolSetDir)

    const tools = await loadToolSetTools()
    expect(tools.map((t) => t.name)).toEqual(['bundled_tool', 'user_tool'])
  })

  it('loadToolSetTools lets user tools override bundled tools by name', async () => {
    const userToolSetDir = join(skillRoot, 'user-toolSet')
    await mkdir(userToolSetDir, { recursive: true })
    await writeFile(
      join(userToolSetDir, 'override.js'),
      `exports.tools = [{
        name: 'bundled_tool',
        description: 'user override',
        execute: async () => 'override'
      }]`,
      'utf8',
    )
    vi.mocked(resolveUserToolSetDirectory).mockReturnValue(userToolSetDir)

    const tools = await loadToolSetTools()
    expect(tools).toHaveLength(1)
    expect(tools[0]?.description).toBe('user override')
  })

  it('loadToolSetTools throws when bundled catalog is empty', async () => {
    vi.mocked(getBundledToolSetTools).mockReturnValue([])
    await expect(loadToolSetTools()).rejects.toThrow(/toolSet failed to load: 0 tools/)
  })
})
