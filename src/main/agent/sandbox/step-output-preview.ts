import { existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BrowserWindow, nativeImage } from 'electron'

export type StepOutputPreviewKind = 'image' | 'html' | 'pdf' | 'office' | 'none'

export type StepOutputPreviewResult = {
  dataUrl: string
  kind: StepOutputPreviewKind
}

const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
])
const HTML_EXT = new Set(['.html', '.htm'])
const PDF_EXT = new Set(['.pdf'])
const OFFICE_EXT = new Set(['.xlsx', '.xls', '.pptx', '.ppt', '.docx', '.doc', '.csv'])

const PREVIEW_MAX_WIDTH = 120
const PREVIEW_MAX_HEIGHT = 80
const CAPTURE_VIEWPORT = { width: 900, height: 640 }
const CAPTURE_SETTLE_MS = 350

const previewCache = new Map<string, StepOutputPreviewResult | null>()

export function filePathFromFileUrl(fileUrl: string): string | null {
  const trimmed = fileUrl.trim()
  if (!trimmed.toLowerCase().startsWith('file://')) return null
  try {
    return fileURLToPath(trimmed)
  } catch {
    return null
  }
}

export function detectStepOutputPreviewKind(filePath: string): StepOutputPreviewKind {
  const ext = extname(filePath).toLowerCase()
  if (IMAGE_EXT.has(ext)) return 'image'
  if (HTML_EXT.has(ext)) return 'html'
  if (PDF_EXT.has(ext)) return 'pdf'
  if (OFFICE_EXT.has(ext)) return 'office'
  return 'none'
}

/** Returns a human-readable label for an office file extension. */
export function officeFileLabel(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  const labels: Record<string, string> = {
    '.xlsx': 'Excel',
    '.xls': 'Excel',
    '.pptx': 'PowerPoint',
    '.ppt': 'PowerPoint',
    '.docx': 'Word',
    '.doc': 'Word',
    '.csv': 'CSV',
  }
  return labels[ext] ?? 'Document'
}

function cacheKey(filePath: string): string | null {
  try {
    const st = statSync(filePath)
    return `${filePath}|${st.mtimeMs}|${st.size}`
  } catch {
    return null
  }
}

function previewFromImageFile(filePath: string): StepOutputPreviewResult | null {
  const image = nativeImage.createFromPath(filePath)
  if (image.isEmpty()) return null
  const dataUrl = jpegDataUrlFromNativeImage(image)
  if (!dataUrl) return null
  return { dataUrl, kind: 'image' }
}

async function previewFromWebContents(
  filePath: string,
  kind: 'html' | 'pdf',
): Promise<StepOutputPreviewResult | null> {
  const win = new BrowserWindow({
    show: false,
    width: CAPTURE_VIEWPORT.width,
    height: CAPTURE_VIEWPORT.height,
    webPreferences: {
      sandbox: false,
      webSecurity: false,
      offscreen: true,
    },
  })
  try {
    const url = pathToFileURL(filePath).href
    await win.loadURL(url)
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_SETTLE_MS))
    const shot = await win.webContents.capturePage()
    const size = shot.getSize()
    const scale = Math.min(
      PREVIEW_MAX_WIDTH / Math.max(size.width, 1),
      PREVIEW_MAX_HEIGHT / Math.max(size.height, 1),
      1,
    )
    const targetW = Math.max(1, Math.round(size.width * scale))
    const targetH = Math.max(1, Math.round(size.height * scale))
    const resized = shot.resize({ width: targetW, height: targetH })
    const jpeg = resized.toJPEG(72)
    return {
      dataUrl: `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`,
      kind,
    }
  } catch {
    return null
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

/** Clear preview cache (tests). */
export function clearStepOutputPreviewCache(): void {
  previewCache.clear()
}

export async function generateStepOutputPreview(
  fileUrl: string,
): Promise<StepOutputPreviewResult | null> {
  const filePath = filePathFromFileUrl(fileUrl)
  if (!filePath || !existsSync(filePath)) return null

  const kind = detectStepOutputPreviewKind(filePath)
  if (kind === 'none') return null
  // Office files can't be rendered natively — return a sentinel so the renderer
  // shows a type-icon card instead of trying to display a screenshot.
  if (kind === 'office') return { dataUrl: '', kind }

  const key = cacheKey(filePath)
  if (key && previewCache.has(key)) {
    return previewCache.get(key) ?? null
  }

  let result: StepOutputPreviewResult | null = null
  try {
    if (kind === 'image') {
      result = await previewFromImageFile(filePath)
    } else {
      result = await previewFromWebContents(filePath, kind)
    }
  } catch {
    result = null
  }

  if (key) previewCache.set(key, result)
  return result
}

/** Resize an existing NativeImage buffer (tests / helpers). */
export function jpegDataUrlFromNativeImage(
  image: Electron.NativeImage,
): string | null {
  const size = image.getSize()
  if (size.width <= 0 || size.height <= 0) return null
  const scale = Math.min(
    PREVIEW_MAX_WIDTH / size.width,
    PREVIEW_MAX_HEIGHT / size.height,
    1,
  )
  const resized = image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  })
  return `data:image/jpeg;base64,${Buffer.from(resized.toJPEG(72)).toString('base64')}`
}

export function nativeImageFromBuffer(buf: Buffer): Electron.NativeImage {
  return nativeImage.createFromBuffer(buf)
}
