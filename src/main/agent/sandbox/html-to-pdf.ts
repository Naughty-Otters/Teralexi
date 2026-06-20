import { writeFile } from 'node:fs/promises'
import { BrowserWindow, type WebContents } from 'electron'

const LOAD_TIMEOUT_MS = 30_000
const POST_FONT_SETTLE_MS = 150

/** Wait for DOM load + web fonts before printing. */
async function waitForPrintReady(webContents: WebContents): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('PDF export timed out while loading HTML'))
    }, LOAD_TIMEOUT_MS)

    const onFailure = (_event: unknown, code: number, desc: string) => {
      clearTimeout(timeout)
      reject(new Error(`PDF export failed to load HTML (${code}): ${desc}`))
    }

    webContents.once('did-fail-load', onFailure)
    webContents.once('did-finish-load', () => {
      webContents.removeListener('did-fail-load', onFailure)
      void webContents
        .executeJavaScript(
          `(async () => {
            if (document.fonts && document.fonts.ready) {
              await document.fonts.ready;
            }
            await new Promise((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
          })()`,
          true,
        )
        .then(async () => {
          await new Promise((r) => setTimeout(r, POST_FONT_SETTLE_MS))
          clearTimeout(timeout)
          resolve()
        })
        .catch((err: unknown) => {
          clearTimeout(timeout)
          reject(
            err instanceof Error
              ? err
              : new Error(`PDF export font/layout prep failed: ${String(err)}`),
          )
        })
    })
  })
}

/** Renders a local HTML file to PDF via a hidden {@link BrowserWindow}. */
export async function exportHtmlFileToPdf(
  htmlFilePath: string,
  pdfFilePath: string,
): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    backgroundThrottling: false,
    webPreferences: {
      sandbox: false,
      webSecurity: false,
      // offscreen windows often miss system font resolution on Linux/macOS.
      offscreen: false,
    },
  })

  try {
    const loadPromise = waitForPrintReady(win.webContents)
    await win.loadFile(htmlFilePath)
    await loadPromise

    const data = await win.webContents.printToPDF({
      printBackground: true,
      // Let CSS @page control margins; default margins double-apply with @page rules.
      marginsType: 1,
      pageSize: 'A4',
      preferCSSPageSize: true,
    })
    await writeFile(pdfFilePath, data)
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`PDF export failed: ${detail}`)
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
