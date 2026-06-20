import { createLoggingFramework } from './pino-framework'

const framework = createLoggingFramework({
  runtime: 'renderer',
  level: 'info',
  base: {
    processType: 'renderer',
  },
  browser: {
    asObject: true,
  },
})

export const { log, createLogger } = framework
