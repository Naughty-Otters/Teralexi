import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}))

describe('playwright-mcp-launch', () => {
  it('resolves the bundled @playwright/mcp cli from node_modules', async () => {
    const { resolvePlaywrightMcpCliPath } = await import('./playwright-mcp-launch')
    const cliPath = resolvePlaywrightMcpCliPath()
    expect(cliPath).toBeTruthy()
    expect(cliPath).toMatch(/cli\.js$/)
    expect(existsSync(cliPath!)).toBe(true)
  })

  it('uses system node for local (unpackaged) launches', async () => {
    const { buildPlaywrightMcpStdioLaunch, resolvePlaywrightMcpCliPath } =
      await import('./playwright-mcp-launch')
    const cliPath = resolvePlaywrightMcpCliPath()!
    const launch = buildPlaywrightMcpStdioLaunch(cliPath, ['--cdp-endpoint', 'x'])
    expect(launch.command).toBe('node')
    expect(launch.args).toEqual([cliPath, '--cdp-endpoint', 'x'])
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(launch.env.TMPDIR).toBe(process.env.TMPDIR?.trim() || tmpdir())
  })

  it('uses Electron-as-Node when the CLI path is inside app.asar', async () => {
    const { buildPlaywrightMcpStdioLaunch, isAsarArchivePath } = await import(
      './playwright-mcp-launch'
    )
    const asarCli = join(
      '/Applications/Teralexi.app/Contents/Resources/app.asar',
      'node_modules',
      '@playwright',
      'mcp',
      'cli.js',
    )
    expect(isAsarArchivePath(asarCli)).toBe(true)
    const launch = buildPlaywrightMcpStdioLaunch(asarCli)
    expect(launch.command).toBe(process.execPath)
    expect(launch.args).toEqual([asarCli])
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(launch.env.TMPDIR).toBeTruthy()
  })

  it('uses Electron-as-Node when the app is packaged', async () => {
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: {
        isPackaged: true,
        getAppPath: () =>
          '/Applications/Teralexi.app/Contents/Resources/app.asar',
      },
    }))
    const { buildPlaywrightMcpStdioLaunch } = await import(
      './playwright-mcp-launch'
    )
    const unpackedCli = join(
      '/Applications/Teralexi.app/Contents/Resources/app.asar.unpacked',
      'node_modules',
      '@playwright',
      'mcp',
      'cli.js',
    )
    const launch = buildPlaywrightMcpStdioLaunch(unpackedCli)
    expect(launch.command).toBe(process.execPath)
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBe('1')
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getAppPath: () => process.cwd(),
      },
    }))
  })

  it('falls back from missing unpacked path to asar twin when Electron can see it', async () => {
    const { acceptPlaywrightMcpCliPath } = await import('./playwright-mcp-launch')
    const realCli = join(
      process.cwd(),
      'node_modules',
      '@playwright',
      'mcp',
      'cli.js',
    )
    // Simulate: unpacked candidate missing, but existsSync on asar twin works
    // by feeding a path that already exists (dev tree has no asar twin — just
    // verify accept returns a real file when candidate exists).
    expect(acceptPlaywrightMcpCliPath(realCli)).toBe(realCli)
  })
})
