import { createHash } from 'node:crypto'
import fs from 'fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, WebContentsView } from 'electron'
import { createLogger, traceFunction } from '@main/logger'
import type { MarkdownPreviewViewMode } from '@shared/file-type/markdown-preview-url'
import { isMarkdownPreviewFileUrl } from '@shared/file-type/markdown-preview-url'
import {
  renderMarkdownSourceHtmlDocument,
  renderMarkdownToHtmlDocument,
} from './result-document-html'

const sandboxResultsViews = new Map<number, WebContentsView>()
const lastLoadedPreview = new Map<
  number,
  { fileUrl: string; markdownView: MarkdownPreviewViewMode }
>()
const previewLoadChains = new Map<number, Promise<void>>()
const closedHandlersRegistered = new Set<number>()
const previewHtmlDir = join(tmpdir(), 'openfde-sandbox-preview')
const log = createLogger('sandbox.output-view')

function isNavigationAbortedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('ERR_ABORTED') || message.includes('(-3)')
}

/** Serialize preview loads per window so rapid toggles do not abort in-flight navigation. */
function schedulePreviewLoad(
  winId: number,
  load: () => Promise<void>,
): Promise<void> {
  const prev = previewLoadChains.get(winId) ?? Promise.resolve()
  const next = prev
    .catch((err: unknown) => {
      if (!isNavigationAbortedError(err)) throw err
    })
    .then(load)
  previewLoadChains.set(winId, next)
  return next
}

async function loadWebContentsUrl(
  view: WebContentsView,
  url: string,
): Promise<void> {
  try {
    await view.webContents.loadURL(url)
  } catch (err) {
    if (isNavigationAbortedError(err)) return
    throw err
  }
}

async function loadWebContentsFile(
  view: WebContentsView,
  filePath: string,
): Promise<void> {
  try {
    await view.webContents.loadFile(filePath)
  } catch (err) {
    if (isNavigationAbortedError(err)) return
    throw err
  }
}

function removeViewForWindow(win: BrowserWindow): void {
  const view = sandboxResultsViews.get(win.id)
  if (!view) return
  lastLoadedPreview.delete(win.id)
  previewLoadChains.delete(win.id)
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderPreviewErrorHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Preview error</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font: 14px/1.5 system-ui, sans-serif;
        color: #991b1b;
        background: #fff;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        margin: 12px 0 0;
        padding: 12px;
        border-radius: 8px;
        background: #fef2f2;
        color: #7f1d1d;
      }
    </style>
  </head>
  <body>
    <strong>Could not preview this file.</strong>
    <pre>${escapeHtml(message)}</pre>
  </body>
</html>`
}

async function previewCacheKey(
  filePath: string,
  markdownView: MarkdownPreviewViewMode,
): Promise<string> {
  const st = await fs.stat(filePath)
  return createHash('sha256')
    .update(`${filePath}\0${st.mtimeMs}\0${st.size}\0${markdownView}`)
    .digest('hex')
    .slice(0, 32)
}

async function loadHtmlDocumentInView(
  view: WebContentsView,
  html: string,
  cacheKey: string,
): Promise<void> {
  await fs.mkdir(previewHtmlDir, { recursive: true })
  const previewPath = join(previewHtmlDir, `${cacheKey}.html`)
  await fs.writeFile(previewPath, html, 'utf8')
  await loadWebContentsFile(view, previewPath)
}

async function loadMarkdownPreview(
  view: WebContentsView,
  fileUrl: string,
  markdownView: MarkdownPreviewViewMode,
): Promise<void> {
  const filePath = fileURLToPath(fileUrl)
  const markdownBody = await fs.readFile(filePath, 'utf8')
  const html =
    markdownView === 'raw'
      ? renderMarkdownSourceHtmlDocument(markdownBody)
      : renderMarkdownToHtmlDocument(markdownBody)
  const cacheKey = await previewCacheKey(filePath, markdownView)
  await loadHtmlDocumentInView(view, html, cacheKey)
}

/**
 * Places a {@link WebContentsView} over the renderer panel that previews
 * sandbox output files or directory listings via file URLs.
 */
async function loadSandboxOutputPreview(
  view: WebContentsView,
  fileUrl: string,
  markdownView: MarkdownPreviewViewMode,
): Promise<void> {
  if (view.webContents.isDestroyed()) return

  if (isMarkdownPreviewFileUrl(fileUrl)) {
    try {
      await loadMarkdownPreview(view, fileUrl, markdownView)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('Failed to load markdown preview', { fileUrl, markdownView, err })
      try {
        await loadHtmlDocumentInView(
          view,
          renderPreviewErrorHtml(message),
          createHash('sha256').update(`${fileUrl}\0${message}`).digest('hex').slice(0, 32),
        )
      } catch (innerErr) {
        log.error('Failed to show markdown preview error page', {
          fileUrl,
          err: innerErr,
        })
        throw innerErr
      }
      return
    }
  }

  await loadWebContentsUrl(view, fileUrl)
}

async function syncSandboxOutputViewImpl(
  event: Electron.IpcMainInvokeEvent,
  args: {
    screenBounds: { x: number; y: number; width: number; height: number }
    fileUrl: string | null
    markdownView?: MarkdownPreviewViewMode
  },
): Promise<void> {
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

  const markdownView = args.markdownView ?? 'html'
  const last = lastLoadedPreview.get(win.id)
  const current = view.webContents.isDestroyed() ? '' : view.webContents.getURL()
  const needsReload =
    !last ||
    last.fileUrl !== args.fileUrl ||
    last.markdownView !== markdownView ||
    current === ''
  if (needsReload && !view.webContents.isDestroyed()) {
    const fileUrl = args.fileUrl
    await schedulePreviewLoad(win.id, async () => {
      await loadSandboxOutputPreview(view, fileUrl, markdownView)
      lastLoadedPreview.set(win.id, { fileUrl, markdownView })
    })
  }
}

export const syncSandboxOutputView = traceFunction(
  log,
  'syncSandboxOutputView',
  syncSandboxOutputViewImpl,
)
