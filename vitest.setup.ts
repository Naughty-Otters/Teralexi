import { vi } from 'vitest'

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn((): typeof noopLogger => noopLogger),
  raw: {
    child: vi.fn((): typeof noopLogger => noopLogger),
  },
}

/** Keep unit tests hermetic: no log files under ~/.openfde and no traced side effects. */
vi.mock('@main/logger', () => ({
  log: noopLogger,
  createLogger: () => noopLogger,
  instrumentObjectMethods: <T>(obj: T) => obj,
  instrumentInstanceMethods: <T>(obj: T) => obj,
  traceFunction: (
    _log: unknown,
    _name: string,
    fn: (...args: unknown[]) => unknown,
  ) => fn,
}))

vi.mock('@logging/main-process-streams', () => ({
  buildMainProcessLogStreams: () => [],
}))
