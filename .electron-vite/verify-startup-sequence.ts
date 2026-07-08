/**
 * End-to-end startup verification for the bootstrap → main-app split.
 * Starts Vite, launches Electron, and asserts main.log milestones.
 *
 * Usage: tsx .electron-vite/verify-startup-sequence.ts
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { detect } from 'detect-port'
import electron from 'electron'
import config from '../config'

const APP_ROOT = join(__dirname, '..')
const MAIN_LOG = join(homedir(), '.teralexi', 'logs', 'main.log')
const TIMEOUT_MS = 90_000

const REQUIRED_MARKERS = [
  'Bootstrap ready',
  'Main app module loaded',
  'Creating main application window',
] as const

const FORBIDDEN_MARKERS = [
  'ERR_INVALID_URL',
  'Renderer failed to load',
  '"winURL":""',
  'winURL: ""',
] as const

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForVite(port: number): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`)
      if (res.ok || res.status === 404) return
    } catch {
      /* retry */
    }
    await sleep(250)
  }
  throw new Error(`Vite did not respond on port ${port} within 60s`)
}

function readNewLogLines(
  fromOffset: number,
): Promise<{ lines: string[]; offset: number }> {
  return new Promise((resolve, reject) => {
    if (!existsSync(MAIN_LOG)) {
      resolve({ lines: [], offset: 0 })
      return
    }

    const stat = statSync(MAIN_LOG)
    const stream = createReadStream(MAIN_LOG, {
      start: fromOffset,
      encoding: 'utf8',
    })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    const lines: string[] = []

    rl.on('line', (line) => lines.push(line))
    rl.on('close', () => resolve({ lines, offset: stat.size }))
    rl.on('error', reject)
  })
}

async function watchStartupMarkers(
  initialOffset: number,
): Promise<{ ok: boolean; details: string[] }> {
  const found = new Set<string>()
  const forbidden: string[] = []
  let offset = initialOffset
  const deadline = Date.now() + TIMEOUT_MS

  while (Date.now() < deadline) {
    const chunk = await readNewLogLines(offset)
    offset = chunk.offset

    for (const line of chunk.lines) {
      for (const marker of REQUIRED_MARKERS) {
        if (line.includes(marker)) found.add(marker)
      }
      for (const bad of FORBIDDEN_MARKERS) {
        if (line.includes(bad)) forbidden.push(line)
      }
      if (line.includes('Initializing window flow') && line.includes('hasBootstrapSplash":true')) {
        found.add('bootstrap splash adopted')
      }
      if (line.includes('Browser window created')) {
        found.add('browser window created')
      }
    }

    if (forbidden.length > 0) {
      return { ok: false, details: forbidden }
    }

    if (REQUIRED_MARKERS.every((marker) => found.has(marker))) {
      const details = [...found]
      if (!details.includes('browser window created')) {
        details.push('(browser window log not seen yet — continuing)')
      }
      return { ok: true, details }
    }

    await sleep(500)
  }

  const missing = REQUIRED_MARKERS.filter((marker) => !found.has(marker))
  return {
    ok: false,
    details: [`Timed out after ${TIMEOUT_MS}ms`, `Missing: ${missing.join(', ')}`],
  }
}

async function startVite(port: number): Promise<() => Promise<void>> {
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: join(__dirname, 'vite.config.mts'),
  })
  await server.listen(port)
  return async () => {
    await server.close()
  }
}

async function main(): Promise<void> {
  for (const file of ['bootstrap.js', 'main-app.js', 'preload.js']) {
    const path = join(APP_ROOT, 'dist', 'electron', 'main', file)
    if (!existsSync(path)) {
      throw new Error(`Missing ${path} — run npm run dev or build first`)
    }
  }

  const port = await detect(config.dev.port || 9080)
  const logOffset = existsSync(MAIN_LOG) ? statSync(MAIN_LOG).size : 0

  const stopVite = await startVite(port)
  await waitForVite(port)

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'development',
  }
  delete env.ELECTRON_RUN_AS_NODE

  let electronProc: ChildProcess | null = spawn(String(electron), [APP_ROOT], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const result = await watchStartupMarkers(logOffset)

  electronProc.kill()
  electronProc = null
  await stopVite()

  if (!result.ok) {
    console.error('Startup verification FAILED')
    for (const line of result.details) console.error(`  ${line}`)
    process.exit(1)
  }

  console.log('Startup verification passed')
  for (const line of result.details) console.log(`  ✓ ${line}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
