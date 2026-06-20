/**
 * Shared logging — framework, per-run agent logs, and process log sinks.
 *
 * Process entry points:
 * - Main: `@main/logger` (re-exports {@link main-logger})
 * - Renderer: `@renderer/utils/logger` (re-exports {@link renderer-logger})
 */

export {
  createLoggingFramework,
  type AppLogger,
  type LogContext,
  type LogStreamSpec,
} from './pino-framework'

export {
  runWithAgentRunLog,
  duplicateAgentRunLog,
  getAgentRunLogFilePath,
  type AgentRunLogMeta,
} from './agent-run-context'

export { buildMainProcessLogStreams } from './main-process-streams'

export {
  log as mainLog,
  createLogger as createMainLogger,
  instrumentObjectMethods,
  instrumentInstanceMethods,
  traceFunction,
} from './main-logger'

export { log as rendererLog, createLogger as createRendererLogger } from './renderer-logger'
