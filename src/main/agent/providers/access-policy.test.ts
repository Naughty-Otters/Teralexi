import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const AGENT_ROOT = join(__dirname, '..')
const STEPS_DIR = join(AGENT_ROOT, 'steps')
const PROVIDERS_DIR = join(__dirname)

const ALLOWED_PROVIDERS_IMPORTS_AT_AGENT_ROOT = new Set([
  'context.ts',
  'flow.ts',
  'engine.ts',
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

function importsProvidersModule(text: string): boolean {
  return (
    text.includes("from '@main/agent/providers'") ||
    text.includes('from "@main/agent/providers"') ||
    text.includes("from '@main/agent/providers/") ||
    text.includes('from "@main/agent/providers/') ||
    text.includes("from '../providers'") ||
    text.includes('from "../providers"') ||
    text.includes("from '../providers/") ||
    text.includes('from "../providers/') ||
    text.includes("from './providers'") ||
    text.includes('from "./providers"') ||
    text.includes("from './providers/") ||
    text.includes('from "./providers/')
  )
}

const ALLOWED_PROVIDERS_SUBPATH_IMPORTS_IN_STEPS = new Set([
  'step-helpers.ts',
  'todo-execution-types.ts',
])

describe('agent providers module access policy', () => {
  it('agent steps do not import providers module directly', () => {
    const violations: string[] = []
    for (const file of collectTsFiles(STEPS_DIR)) {
      const baseName = file.split(/[/\\]/).pop() ?? file
      if (ALLOWED_PROVIDERS_SUBPATH_IMPORTS_IN_STEPS.has(baseName)) continue
      if (importsProvidersModule(readFileSync(file, 'utf8'))) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })

  it('only approved agent root files import providers at package root', () => {
    const violations: string[] = []
    for (const name of readdirSync(AGENT_ROOT)) {
      if (!name.endsWith('.ts')) continue
      if (name.endsWith('.test.ts')) continue
      if (ALLOWED_PROVIDERS_IMPORTS_AT_AGENT_ROOT.has(name)) continue
      if (importsProvidersModule(readFileSync(join(AGENT_ROOT, name), 'utf8'))) {
        violations.push(name)
      }
    }
    expect(violations).toEqual([])
  })

  it('providers package does not import its own barrel', () => {
    const violations: string[] = []
    for (const name of readdirSync(PROVIDERS_DIR)) {
      if (!name.endsWith('.ts')) continue
      if (name.endsWith('.test.ts')) continue
      if (name === 'index.ts') continue
      if (importsProvidersModule(readFileSync(join(PROVIDERS_DIR, name), 'utf8'))) {
        violations.push(name)
      }
    }
    expect(violations).toEqual([])
  })
})
