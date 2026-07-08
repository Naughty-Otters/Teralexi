import readline from 'node:readline'
import electron from 'electron'
import chalk from 'chalk'
import { join } from 'path'
import { watch } from 'rollup'
import { detect } from 'detect-port'
import config from '../config'
import { say } from 'cfonts'
import { exec } from 'child_process'
import type { ChildProcess } from 'child_process'
import rollupOptions from './rollup.config'
import { applyBuildEnvFromArgv, electronLog, getArgv, logStats, removeJunk } from './utils'

applyBuildEnvFromArgv()

function escapeShellToken(token: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(token)) {
    return token
  }

  if (process.platform === 'win32') {
    return `"${token.replace(/"/g, '""')}"`
  }

  return `'${token.replace(/'/g, `'"'"'`)}'`
}

const { target = 'client', controlledRestart = false } = getArgv()

const bootstrapOpt = rollupOptions(process.env.NODE_ENV, 'bootstrap')
const mainAppOpt = rollupOptions(process.env.NODE_ENV, 'main-app')
const preloadOpt = rollupOptions(process.env.NODE_ENV, 'preload')

let electronProcess: ChildProcess | null = null
let manualRestart = false
let readlineInterface: readline.Interface | null = null

interface Shortcut {
  key: string
  description: string
  action: () => void
}

const shortcutList: Shortcut[] = [
  {
    key: 'r',
    description: 'Restart Main Process',
    action() {
      restartElectron()
    },
  },
  {
    key: 'q',
    description: 'Exit',
    action() {
      electronProcess?.kill()
      readlineInterface?.close()
      process.exit()
    },
  },
  {
    key: 'h',
    description: 'Show Help',
    action() {
      process.stdout.write('\x1B[2J\x1B[3J')
      showHelp()
    },
  },
]

async function startRenderer(port: number): Promise<void> {
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: join(__dirname, 'vite.config.mts'),
  })
  process.env.PORT = String(port)
  await server.listen(port)
  console.log(
    '\n\n' + chalk.blue(`  Preparing main process, please wait...`) + '\n\n',
  )
}

function startMain(): Promise<void> {
  return new Promise((resolve, reject) => {
    let bootstrapDone = false
    let mainAppDone = false

    const maybeResolve = () => {
      if (bootstrapDone && mainAppDone) {
        resolve()
      }
    }

    const MainWatcher = watch(bootstrapOpt)
    MainWatcher.on('change', (filename) => {
      logStats(`Main-Bootstrap-FileChange`, filename)
    })
    MainWatcher.on('event', (event) => {
      if (event.code === 'END') {
        bootstrapDone = true
        if (electronProcess && !controlledRestart) {
          restartElectron()
        }
        maybeResolve()
      } else if (event.code === 'ERROR') {
        reject(event.error)
      }
      if (controlledRestart) {
        process.stdout.write('\x1B[2J\x1B[3J')
        logStats(
          'cli tips',
          `Controlled restart is enabled, please manually enter r + Enter to restart`,
        )
      }
    })

    const MainAppWatcher = watch(mainAppOpt)
    MainAppWatcher.on('change', (filename) => {
      logStats(`Main-App-FileChange`, filename)
    })
    MainAppWatcher.on('event', (event) => {
      if (event.code === 'END') {
        mainAppDone = true
        if (electronProcess && !controlledRestart) {
          restartElectron()
        }
        maybeResolve()
      } else if (event.code === 'ERROR') {
        reject(event.error)
      }
      if (controlledRestart) {
        process.stdout.write('\x1B[2J\x1B[3J')
        logStats(
          'cli tips',
          `Controlled restart is enabled, please manually enter r + Enter to restart`,
        )
      }
    })
  })
}

function startPreload(): Promise<void> {
  console.log(
    '\n\n' + chalk.blue(`  Preparing preLoad File, please wait...`) + '\n\n',
  )
  return new Promise((resolve, reject) => {
    const PreloadWatcher = watch(preloadOpt)
    PreloadWatcher.on('change', (filename) => {
      // Preload script log section
      logStats(`preLoad-FileChange`, filename)
    })
    PreloadWatcher.on('event', (event) => {
      if (event.code === 'END') {
        if (electronProcess && !controlledRestart) {
          restartElectron()
        }

        resolve()
      } else if (event.code === 'ERROR') {
        reject(event.error)
      }
      if (controlledRestart) {
        process.stdout.write('\x1B[2J\x1B[3J')
        logStats(
          'cli tips',
          `Controlled restart is enabled, please manually enter r + Enter to restart`,
        )
      }
    })
  })
}

function startElectron() {
  const appRoot = join(__dirname, '..')
  var args = [
    // '--inspect-brk=9229',
    '--inspect=9229',
    appRoot,
  ]

  // detect yarn or npm and process commandline args accordingly
  if (process.env.npm_execpath?.endsWith('yarn.js')) {
    args = args.concat(process.argv.slice(3))
  } else if (process.env.npm_execpath?.endsWith('npm-cli.js')) {
    args = args.concat(process.argv.slice(2))
  }

  const electronCommand = [String(electron), ...args]
    .map(escapeShellToken)
    .join(' ')

  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  electronProcess = exec(
    electronCommand,
    {
      windowsHide: true,
      maxBuffer: 1020 * 1024 * 1024,
      env,
    },
    (error) => {
      if (error && !manualRestart) {
        electronLog(removeJunk(String(error)), 'red')
      }
    },
  )

  electronProcess.stdout?.on('data', (data: string) => {
    electronLog(removeJunk(data), 'blue')
  })
  electronProcess.stderr?.on('data', (data: string) => {
    electronLog(removeJunk(data), 'red')
  })

  electronProcess.on('close', () => {
    if (!manualRestart) process.exit()
  })
}

function restartElectron() {
  manualRestart = true
  electronProcess?.pid && process.kill(electronProcess.pid)
  electronProcess = null
  electronProcess = null
  startElectron()
  setTimeout(() => {
    manualRestart = false
  }, 5000)
}

function onInputAction(input: string) {
  if (!controlledRestart && input === 'r') {
    console.log(
      chalk.yellow.bold(
        'Controlled restart is disabled, please use the --controlledRestart option to enable when starting',
      ),
    )
    return
  }
  const shortcut = shortcutList.find((shortcut) => shortcut.key === input)
  if (shortcut) {
    shortcut.action()
  }
}

function initReadline() {
  readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  readlineInterface.on('line', onInputAction)
}

function showHelp() {
  console.log(chalk.green.bold(`Available shortcuts:\n`))
  shortcutList.forEach((shortcut) => {
    console.log(
      `Press ${chalk.green.bold(shortcut.key)} + Enter ${shortcut.description}`,
    )
  })
  console.log('\n')
}

function greeting() {
  const cols = process.stdout.columns
  let text: string | boolean = ''

  if (cols > 104) text = 'Teralexi AI'
  else if (cols > 76) text = 'Teralexi'
  else text = false

  if (text) {
    say(text, {
      colors: ['yellow'],
      font: 'simple3d',
      space: false,
    })
  } else console.log(chalk.yellow.bold('\n  Teralexi AI'))
  console.log(chalk.blue(`  getting ready...`) + '\n')
}

async function init() {
  const port = await detect(config.dev.port || 9080)
  if (target === 'web') {
    await startRenderer(port)
    return
  }
  greeting()
  try {
    await Promise.all([startRenderer(port), startMain(), startPreload()])
    startElectron()
    initReadline()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

init()
