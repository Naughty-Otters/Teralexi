import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const AGENT_ROOT = join(__dirname, '..')
const STEPS_DIR = join(AGENT_ROOT, 'steps')
const RESOURCES_DIR = join(__dirname)

const ALLOWED_RESOURCES_IMPORTS_AT_AGENT_ROOT = new Set([
  'context.ts',
  'types.ts',
  'test-module-contexts.ts',
])

function collectTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(path)
    }
  }
  return out
}

function importsResourcesModule(text: string): boolean {
  return (
    text.includes("from '@main/agent/resources'") ||
    text.includes('from "@main/agent/resources"') ||
    text.includes("from '@main/agent/resources/") ||
    text.includes('from "@main/agent/resources/') ||
    text.includes("from '../resources'") ||
    text.includes('from "../resources"') ||
    text.includes("from '../resources/") ||
    text.includes('from "../resources/') ||
    text.includes("from './resources'") ||
    text.includes('from "./resources"') ||
    text.includes("from './resources/") ||
    text.includes('from "./resources/') ||
    text.includes("from '../reference-resource'") ||
    text.includes('from "./reference-resource"')
  )
}

describe('agent resources module access policy', () => {
  it('agent steps do not import resources module directly', () => {
    const violations: string[] = []
    for (const file of collectTsFiles(STEPS_DIR)) {
      if (importsResourcesModule(readFileSync(file, 'utf8'))) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })

  it('only approved agent root files import resources at package root', () => {
    const violations: string[] = []
    for (const name of readdirSync(AGENT_ROOT)) {
      if (!name.endsWith('.ts')) continue
      if (name.endsWith('.test.ts')) continue
      if (ALLOWED_RESOURCES_IMPORTS_AT_AGENT_ROOT.has(name)) continue
      if (importsResourcesModule(readFileSync(join(AGENT_ROOT, name), 'utf8'))) {
        violations.push(name)
      }
    }
    expect(violations).toEqual([])
  })

  it('resources package does not import its own barrel', () => {
    const violations: string[] = []
    for (const name of readdirSync(RESOURCES_DIR)) {
      if (!name.endsWith('.ts')) continue
      if (name.endsWith('.test.ts')) continue
      if (name === 'index.ts') continue
      if (importsResourcesModule(readFileSync(join(RESOURCES_DIR, name), 'utf8'))) {
        violations.push(name)
      }
    }
    expect(violations).toEqual([])
  })
})
