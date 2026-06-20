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
vi.mock('./skill-path', () => ({
  resolveToolSetSourceRoots: vi.fn(() => []),
}))

import { resolveToolSetSourceRoots } from './skill-path'
import {
  loadSkillActions,
  loadToolSetTools,
  loadToolSetToolsFromDirectory,
} from './skill-module-loader'

describe('skill-module-loader', () => {
  let skillRoot: string

  beforeEach(async () => {
    vi.mocked(existsSync).mockImplementation(
      (await vi.importActual<typeof import('fs')>('fs')).existsSync,
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
})
