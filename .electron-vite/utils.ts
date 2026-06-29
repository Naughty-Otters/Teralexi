import { config } from 'dotenv'
import { join } from 'path'
import chalk from 'chalk'
import cliConfig from '../config'
import {
  buildEnvToEnvFileName,
  buildEnvToNodeEnv,
  normalizeBuildEnv,
  OPENFDE_BUILD_ENV_VAR,
  type OpenFdeBuildEnv,
} from '../config/build-env'
import minimist from 'minimist'

const argv = minimist(process.argv.slice(2))
const rootResolve = (...pathSegments: string[]) =>
  join(__dirname, '..', ...pathSegments)

export const getEnv = () => argv['m']
export const getArgv = () => argv

export function getBuildEnvMode(): OpenFdeBuildEnv {
  if (process.env[OPENFDE_BUILD_ENV_VAR]?.trim()) {
    return normalizeBuildEnv(process.env[OPENFDE_BUILD_ENV_VAR])
  }
  return normalizeBuildEnv(getEnv() ?? 'dev')
}

export function applyBuildEnvFromArgv(): OpenFdeBuildEnv {
  const mode = getBuildEnvMode()
  process.env[OPENFDE_BUILD_ENV_VAR] = mode
  process.env.NODE_ENV = buildEnvToNodeEnv(mode)
  return mode
}

const getEnvPath = () =>
  rootResolve('env', buildEnvToEnvFileName(getBuildEnvMode()))

export const getConfig = () => {
  applyBuildEnvFromArgv()
  return config({ path: getEnvPath() }).parsed
}

export const logStats = (proc: string, data: any) => {
  let log = ''

  log += chalk.yellow.bold(
    `┏ ${proc} Process ${new Array(19 - proc.length + 1).join('-')}`,
  )
  log += '\n\n'

  if (typeof data === 'object') {
    data
      .toString({
        colors: true,
        chunks: false,
      })
      .split(/\r?\n/)
      .forEach((line) => {
        log += '  ' + line + '\n'
      })
  } else {
    log += `  ${data}\n`
  }

  log += '\n' + chalk.yellow.bold(`┗ ${new Array(28 + 1).join('-')}`) + '\n'
  console.log(log)
}

export const removeJunk = (chunk: string) => {
  if (cliConfig.dev.removeElectronJunk) {
    // Example: 2018-08-10 22:48:42.866 Electron[90311:4883863] *** WARNING: Textured window <AtomNSWindow: 0x7fb75f68a770>
    if (
      /\d+-\d+-\d+ \d+:\d+:\d+\.\d+ Electron(?: Helper)?\[\d+:\d+] /.test(chunk)
    ) {
      return false
    }

    // Example: [90789:0810/225804.894349:ERROR:CONSOLE(105)] "Uncaught (in promise) Error: Could not instantiate: ProductRegistryImpl.Registry", source: chrome-devtools://devtools/bundled/inspector.js (105)
    if (/\[\d+:\d+\/|\d+\.\d+:ERROR:CONSOLE\(\d+\)\]/.test(chunk)) {
      return false
    }

    // Example: ALSA lib confmisc.c:767:(parse_card) cannot find card '0'
    if (/ALSA lib [a-z]+\.c:\d+:\([a-z_]+\)/.test(chunk)) {
      return false
    }
  }

  return chunk
}

export const electronLog = (data: any, color: string) => {
  if (data) {
    let log = ''
    data = data.toString().split(/\r?\n/)
    data.forEach((line) => {
      log += `  ${line}\n`
    })
    console.log(
      chalk[color].bold(`┏ Electron -------------------`) +
        '\n\n' +
        log +
        chalk[color].bold('┗ ----------------------------') +
        '\n',
    )
  }
}
