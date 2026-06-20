import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const AGENT_ROOT = join(__dirname, '..')
const STEPS_DIR = join(AGENT_ROOT, 'steps')
const SANDBOX_DIR = join(__dirname)

const ALLOWED_SANDBOX_IMPORTS_AT_AGENT_ROOT = new Set([
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

function importsSandboxModule(text: string): boolean {
  return (
    text.includes("from '@main/agent/sandbox'") ||
    text.includes('from "@main/agent/sandbox"') ||
    text.includes("from '@main/agent/sandbox/") ||
    text.includes('from "@main/agent/sandbox/')
  )
}

describe('agent sandbox module access policy', () => {
  it('agent steps do not import agent/sandbox directly', () => {
    const violations: string[] = []
    for (const file of collectTsFiles(STEPS_DIR)) {
      if (importsSandboxModule(readFileSync(file, 'utf8'))) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })

  it('only approved agent root files import agent/sandbox at package root', () => {
    const violations: string[] = []
    for (const name of readdirSync(AGENT_ROOT)) {
      if (!name.endsWith('.ts')) continue
      if (name.endsWith('.test.ts')) continue
      if (ALLOWED_SANDBOX_IMPORTS_AT_AGENT_ROOT.has(name)) continue
      if (importsSandboxModule(readFileSync(join(AGENT_ROOT, name), 'utf8'))) {
        violations.push(name)
      }
    }
    expect(violations).toEqual([])
  })

  it('sandbox package does not import its own barrel', () => {
    const violations: string[] = []
    for (const name of readdirSync(SANDBOX_DIR)) {
      if (!name.endsWith('.ts')) continue
      if (name.endsWith('.test.ts')) continue
      if (name === 'index.ts') continue
      if (importsSandboxModule(readFileSync(join(SANDBOX_DIR, name), 'utf8'))) {
        violations.push(name)
      }
    }
    expect(violations).toEqual([])
  })
})
