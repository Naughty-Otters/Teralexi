import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolvePlaywrightMcpCliPath } from './playwright-mcp-launch'

describe('playwright-mcp-launch', () => {
  it('resolves the bundled @playwright/mcp cli from node_modules', () => {
    const cliPath = resolvePlaywrightMcpCliPath()
    expect(cliPath).toBeTruthy()
    expect(cliPath).toMatch(/cli\.js$/)
    expect(existsSync(cliPath!)).toBe(true)
  })
})
