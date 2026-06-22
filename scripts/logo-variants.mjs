/**
 * Derives light-background and menu-bar tray variants from openfde-logo.png.
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
 * Bold black template icon for macOS menu bar / system tray.
 * Stroke thickening runs at menu-bar pixel size so lines stay visible after downscale.
 */
export async function createTrayTemplateIcon(
  sourcePath,
  outputPath,
  { canvasSize = 128, dilateRadius = 3 } = {},
) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .resize(canvasSize, canvasSize, { kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  const alpha = dilateAlpha(
    strokeMaskFromSource(data, width, height, channels),
    width,
    height,
    dilateRadius,
  )
  const rgba = rgbaFromAlphaMask(alpha, width, height, { r: 0, g: 0, b: 0, a: 255 })
  await writePng(rgba, width, height, outputPath)
}
