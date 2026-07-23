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

/**
 * Keep unit tests hermetic: never load the real `electron` package.
 * Requiring it runs install/download of the Electron binary; a broken or
 * missing install fails the suite with "Electron failed to install correctly".
 * Per-file `vi.mock('electron', …)` still overrides this default.
 */
vi.mock('electron', () => {
  const emptyImage = {
    isEmpty: () => true,
    getSize: () => ({ width: 0, height: 0 }),
    resize: () => emptyImage,
    toJPEG: () => Buffer.alloc(0),
    toPNG: () => Buffer.alloc(0),
    toDataURL: () => '',
  }
  return {
    app: {
      isPackaged: false,
      isQuiting: false,
      getAppPath: vi.fn(() => '/app'),
      getPath: vi.fn((name: string) => `/tmp/teralexi-test/${name}`),
      getVersion: vi.fn(() => '0.0.0-test'),
      getName: vi.fn(() => 'Teralexi'),
      setName: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      once: vi.fn(),
      quit: vi.fn(),
      exit: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
      setAsDefaultProtocolClient: vi.fn(),
      removeAsDefaultProtocolClient: vi.fn(),
      commandLine: { appendSwitch: vi.fn() },
      dock: { setIcon: vi.fn() },
    },
    BrowserWindow: vi.fn(function BrowserWindowMock() {
      return {
        loadURL: vi.fn(),
        on: vi.fn(),
        once: vi.fn(),
        close: vi.fn(),
        destroy: vi.fn(),
        isDestroyed: vi.fn(() => false),
        webContents: {
          on: vi.fn(),
          once: vi.fn(),
          send: vi.fn(),
          openDevTools: vi.fn(),
        },
      }
    }),
    dialog: {
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
      showMessageBox: vi.fn(),
      showErrorBox: vi.fn(),
    },
    shell: {
      openExternal: vi.fn(),
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeHandler: vi.fn(),
    },
    protocol: {
      registerSchemesAsPrivileged: vi.fn(),
      handle: vi.fn(),
    },
    session: {
      defaultSession: { loadExtension: vi.fn() },
    },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        workAreaSize: { width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      })),
      getDisplayMatching: vi.fn(() => ({
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      })),
    },
    nativeTheme: { shouldUseDarkColors: false },
    nativeImage: {
      createFromPath: vi.fn(() => emptyImage),
      createFromDataURL: vi.fn(() => emptyImage),
      createEmpty: vi.fn(() => emptyImage),
    },
    Menu: {
      buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })),
      setApplicationMenu: vi.fn(),
    },
    WebContentsView: vi.fn(),
  }
})

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
