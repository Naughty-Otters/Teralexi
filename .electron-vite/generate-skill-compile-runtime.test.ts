import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateSkillCompileRuntime } from './generate-skill-compile-runtime'

describe('generate-skill-compile-runtime', () => {
  it('transpiles skill-compile sources to dist/electron/skill-compile-runtime', () => {
    const count = generateSkillCompileRuntime()
    expect(count).toBeGreaterThan(100)

    const runtimeRoot = join(process.cwd(), 'dist/electron/skill-compile-runtime')
    const mainTypes = join(runtimeRoot, 'src/main/skills/types.js')
    const sharedAgent = join(runtimeRoot, 'src/shared/agent/mandatory-tools.js')
    const toolSetIndex = join(runtimeRoot, 'toolSet/index.js')
    const configHome = join(runtimeRoot, 'config/openfde-home.js')

    expect(existsSync(mainTypes)).toBe(true)
    expect(existsSync(sharedAgent)).toBe(true)
    expect(existsSync(toolSetIndex)).toBe(true)
    expect(existsSync(configHome)).toBe(true)
    expect(readFileSync(mainTypes, 'utf8')).toContain('module.exports')
  })
})
