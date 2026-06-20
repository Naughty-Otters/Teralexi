import { duplicateAgentRunLog } from './agent-run-context'
import { createLoggingFramework } from './pino-framework'
import { buildMainProcessLogStreams } from './main-process-streams'

const framework = createLoggingFramework({
  runtime: 'main',
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  base: {
    processType: 'main',
  },
  streams: buildMainProcessLogStreams(),
  duplicateEmit: duplicateAgentRunLog,
})

export const {
  log,
  createLogger,
  instrumentObjectMethods,
  instrumentInstanceMethods,
  traceFunction,
} = framework
