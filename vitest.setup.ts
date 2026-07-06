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

/** Keep unit tests hermetic: no log files under ~/.teralexi and no traced side effects. */
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

/** Prime ICU formatters used by datetime injection so cold-start stalls do not time out tests. */
function warmIntlDateTimeFormat(): void {
  try {
    const now = new Date('2026-06-20T12:00:00.000Z')
    new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: 'UTC',
    }).format(now)
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
    Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    // Minimal ICU builds may omit some options; tests fall back to UTC.
  }
}

warmIntlDateTimeFormat()
