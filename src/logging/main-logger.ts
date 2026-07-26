import { createLoggingFramework } from './pino-framework'
import { buildMainProcessLogStreams } from './main-process-streams'

const framework = createLoggingFramework({
  runtime: 'main',
  level: 'info',
  base: {
    processType: 'main',
  },
  streams: buildMainProcessLogStreams(),
})

export const {
  log,
  createLogger,
  instrumentObjectMethods,
  instrumentInstanceMethods,
  traceFunction,
} = framework
