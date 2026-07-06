/**
 * Derives light-background and menu-bar tray variants from teralexi-logo.png.
 */
import sharp from 'sharp'

const STROKE_LUMINANCE = 40
const LIGHT_STROKE = { r: 28, g: 28, b: 28, a: 255 }

function dilateAlpha(alpha, width, height, radius) {
  const out = new Uint8Array(alpha.length)
  const r2 = radius * radius
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxVal = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          maxVal = Math.max(maxVal, alpha[ny * width + nx])
        }
      }
      out[y * width + x] = maxVal
    }
  }
  return out
}

async function readRgba(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

function strokeMaskFromSource(data, width, height, channels) {
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const idx = i * channels
    const a = data[idx + 3]
    if (a < 10) continue
    const luminance = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
    alpha[i] = luminance > STROKE_LUMINANCE ? 255 : 0
  }
  return alpha
}

function rgbaFromAlphaMask(alpha, width, height, color) {
  const out = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4
    const a = alpha[i]
    out[idx] = color.r
    out[idx + 1] = color.g
    out[idx + 2] = color.b
    out[idx + 3] = Math.round((a * color.a) / 255)
  }
  return out
}

async function writePng(buffer, width, height, outputPath) {
  await sharp(buffer, { raw: { width, height, channels: 4 } }).png().toFile(outputPath)
}

/** Dark strokes on transparent background — for light UI surfaces. */
export async function createLightBackgroundLogo(sourcePath, outputPath) {
  const { data, width, height, channels } = await readRgba(sourcePath)
  const alpha = strokeMaskFromSource(data, width, height, channels)
  const rgba = rgbaFromAlphaMask(alpha, width, height, LIGHT_STROKE)
  await writePng(rgba, width, height, outputPath)
}

/**
 * Black template icon for macOS menu bar / system tray, derived from teralexi-logo.png.
 * No stroke dilation — keeps the logo's natural line weight at menu-bar size.
 */
export async function createTrayTemplateIcon(
  sourcePath,
  outputPath,
  { canvasSize = 16, dilateRadius = 0, contentScale = 1 } = {},
) {
  const contentSize = Math.max(1, Math.round(canvasSize * contentScale))
  const pad = Math.round((canvasSize - contentSize) / 2)

  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .resize(contentSize, contentSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .extend({
      top: pad,
      bottom: canvasSize - contentSize - pad,
      left: pad,
      right: canvasSize - contentSize - pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  let alpha = strokeMaskFromSource(data, width, height, channels)
  if (dilateRadius > 0) {
    alpha = dilateAlpha(alpha, width, height, dilateRadius)
  }
  const rgba = rgbaFromAlphaMask(alpha, width, height, { r: 0, g: 0, b: 0, a: 255 })
  await writePng(rgba, width, height, outputPath)
}

/** @1x and @2x menu-bar PNGs for Electron Tray. */
export async function createMenuBarTrayIcons(sourcePath, outDir) {
  const { join } = await import('node:path')
  await createTrayTemplateIcon(sourcePath, join(outDir, 'tray-icon.png'), {
    canvasSize: 22,
  })
  await createTrayTemplateIcon(sourcePath, join(outDir, 'tray-icon@2x.png'), {
    canvasSize: 44,
  })
}

/** Dark base under the semi-transparent gradient stops. */
const APP_ICON_BASE = '#0a0e17'

/**
 * Electron dock / taskbar icon — rounded square, gradient background, cyan glow, logo centered.
 * Matches: linear-gradient(135deg, rgba(0,212,255,0.4), rgba(124,58,237,0.4))
 *          box-shadow: 0 0 20px rgba(0,212,255,0.25)
 */
export async function createAppIconPng(sourcePath, outputPath, { size = 1024 } = {}) {
  const glowBlur = Math.round((20 * size) / 512)
  const logoSize = Math.round(size * 0.66)
  const offset = Math.round((size - logoSize) / 2)
  const inset = Math.round(size * 0.06)
  const inner = size - inset * 2
  const cornerRadius = Math.round(inner * 0.223)
  const borderWidth = Math.max(1, Math.round(size / 256))

  const bgSvg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgb(0,212,255)" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="rgb(124,58,237)" stop-opacity="0.4"/>
        </linearGradient>
        <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="0" stdDeviation="${glowBlur}"
            flood-color="rgb(0,212,255)" flood-opacity="0.25"/>
        </filter>
      </defs>
      <rect x="${inset}" y="${inset}" width="${inner}" height="${inner}" rx="${cornerRadius}"
        fill="${APP_ICON_BASE}"/>
      <rect x="${inset}" y="${inset}" width="${inner}" height="${inner}" rx="${cornerRadius}"
        fill="url(#bg)" filter="url(#glow)"/>
      <rect x="${inset + borderWidth / 2}" y="${inset + borderWidth / 2}"
        width="${inner - borderWidth}" height="${inner - borderWidth}" rx="${cornerRadius - borderWidth / 2}"
        fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="${borderWidth}"/>
      <rect x="${inset + borderWidth * 1.5}" y="${inset + borderWidth * 1.5}"
        width="${inner - borderWidth * 3}" height="${inner - borderWidth * 3}" rx="${Math.max(1, cornerRadius - borderWidth * 1.5)}"
        fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="${Math.max(1, borderWidth / 2)}"/>
    </svg>`,
  )

  const logo = await sharp(sourcePath)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  await sharp(bgSvg)
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(outputPath)
}
