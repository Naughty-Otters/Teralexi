import { BrowserWindow, WebContentsView } from 'electron'
import { createLogger, traceFunction } from '@main/logger'

const sandboxResultsViews = new Map<number, WebContentsView>()
const closedHandlersRegistered = new Set<number>()
const log = createLogger('sandbox.output-view')

function removeViewForWindow(win: BrowserWindow): void {
  const view = sandboxResultsViews.get(win.id)
  if (!view) return
  try {
    if (!win.isDestroyed()) {
      win.contentView.removeChildView(view)
    }
  } catch {
    // ignore
  }
  try {
    if (!view.webContents.isDestroyed()) {
      view.webContents.close()
    }
  } catch {
    // ignore
  }
  sandboxResultsViews.delete(win.id)
}

function ensureClosedCleanup(win: BrowserWindow): void {
  const id = win.id
  if (closedHandlersRegistered.has(id)) return
  closedHandlersRegistered.add(id)
  win.once('closed', () => {
    closedHandlersRegistered.delete(id)
    const view = sandboxResultsViews.get(id)
    if (!view) return
    sandboxResultsViews.delete(id)
    try {
      if (!view.webContents.isDestroyed()) {
        view.webContents.close()
      }
    } catch {
      // ignore
    }
  })
}

/**
 * Places a {@link WebContentsView} over the renderer panel that previews
 * `<sandbox>/output/results` via a file URL (directory listing).
 */
function syncSandboxOutputViewImpl(
  event: Electron.IpcMainInvokeEvent,
  args: {
    screenBounds: { x: number; y: number; width: number; height: number }
    fileUrl: string | null
  },
): void {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return

  const screenBounds = args.screenBounds
  const contentBounds = win.getContentBounds()
  const rel = {
    x: Math.round(screenBounds.x - contentBounds.x),
    y: Math.round(screenBounds.y - contentBounds.y),
    width: Math.max(0, Math.round(screenBounds.width)),
    height: Math.max(0, Math.round(screenBounds.height)),
  }

  if (!args.fileUrl) {
    removeViewForWindow(win)
    return
  }

  let view = sandboxResultsViews.get(win.id)
  if (!view) {
    view = new WebContentsView({
      webPreferences: {
        // Directory/file `file://` previews need full local access; Chromium
        // sandbox + webSecurity block typical file listings.
        sandbox: false,
        webSecurity: false,
        contextIsolation: true,
      },
    })
    view.setBackgroundColor('#ffffff')
    sandboxResultsViews.set(win.id, view)
    win.contentView.addChildView(view)
    ensureClosedCleanup(win)

    if (!view.webContents.isDestroyed()) {
      view.webContents.on('did-fail-load', (_event, errorCode, errorDesc, url) => {
        log.error('Sandbox output view failed to load', {
          errorCode,
          errorDesc,
          url,
        })
      })
      view.webContents.on('did-finish-load', () => {
        if (!win.isDestroyed()) {
          win.contentView.addChildView(view)
        }
      })
    }
  }

  view.setBounds(rel)

  const current = view.webContents.isDestroyed()
    ? ''
    : view.webContents.getURL()
  if (current !== args.fileUrl && !view.webContents.isDestroyed()) {
    void view.webContents.loadURL(args.fileUrl)
  }
}

export const syncSandboxOutputView = traceFunction(
  log,
  'syncSandboxOutputView',
  syncSandboxOutputViewImpl,
)
