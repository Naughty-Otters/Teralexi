import { ensureSystemPropFile, getSystemPropValue } from './system-prop'

function toBoolean(raw: string, fallback: boolean): boolean {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return fallback
}

function toNumber(raw: string, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

ensureSystemPropFile()

export default {
  build: {
    hotPublishUrl: getSystemPropValue('app.build.hotPublishUrl', ''),
    hotPublishConfigName: getSystemPropValue(
      'app.build.hotPublishConfigName',
      'update-config',
    ),
  },
  dev: {
    removeElectronJunk: toBoolean(
      getSystemPropValue('app.dev.removeElectronJunk', 'true'),
      true,
    ),
    chineseLog: toBoolean(
      getSystemPropValue('app.dev.chineseLog', 'false'),
      false,
    ),
    port: toNumber(getSystemPropValue('app.dev.port', '9080'), 9080),
  },
  DllFolder: getSystemPropValue('app.paths.dllFolder', ''),
  HotUpdateFolder: getSystemPropValue('app.paths.hotUpdateFolder', 'update'),
  UseStartupChart: toBoolean(
    getSystemPropValue('app.window.useStartupChart', 'true'),
    true,
  ),
  IsUseSysTitle: toBoolean(
    getSystemPropValue('app.window.useSystemTitle', 'false'),
    false,
  ),
  google: {
    workspace: {
      clientId: getSystemPropValue('app.google.workspace.clientId', ''),
      clientSecret: getSystemPropValue('app.google.workspace.clientSecret', ''),
    },
    clientId: getSystemPropValue('app.google.clientId', ''),
    clientSecret: getSystemPropValue('app.google.clientSecret', ''),
  },
  github: {
    clientId: getSystemPropValue('app.github.clientId', ''),
    clientSecret: getSystemPropValue('app.github.clientSecret', ''),
  },
  support: {
    uploadUrl: getSystemPropValue('app.support.uploadUrl', '').trim(),
    maxMegabytes: toNumber(
      getSystemPropValue('app.support.maxMegabytes', '100'),
      100,
    ),
  },
  client: {
    id: getSystemPropValue('app.client.id', '').trim(),
  },
  metrics: {
    graphqlUrl: getSystemPropValue('app.metrics.graphqlUrl', '').trim(),
  },
}
