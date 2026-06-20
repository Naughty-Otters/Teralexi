#!/usr/bin/env node
/**
 * Generates Electron app icons in build/icons/ from openfde-logo.png.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import png2icons from 'png2icons'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'src/renderer/assets/icons')
const out = join(root, 'build/icons')
const logoPng = join(assets, 'openfde-logo.png')
const publicDir = join(root, 'src/renderer/public')

function hasPrebuiltIcons() {
  const required = [
    join(out, '256x256.png'),
    join(out, 'icon.png'),
    join(out, 'tray-icon.png'),
    join(out, 'tray-icon@2x.png'),
    join(out, 'icon.ico'),
    join(out, 'icon.icns'),
    join(publicDir, 'favicon.png'),
    join(publicDir, 'favicon.ico'),
  ]
  return required.every((p) => existsSync(p))
}

function copyLogo(dest) {
  writeFileSync(dest, readFileSync(logoPng))
}

function writeIcoFromPng(pngPath, icoPath) {
  const png = readFileSync(pngPath)
  const ico = png2icons.createICO(png, png2icons.BILINEAR, 0, false, true)
  if (!ico) throw new Error(`Failed to create ICO from ${pngPath}`)
  writeFileSync(icoPath, ico)
}

function writeIcnsFromPng(pngPath, icnsPath) {
  const png = readFileSync(pngPath)
  const icns = png2icons.createICNS(png, png2icons.BILINEAR, 0)
  if (!icns) throw new Error(`Failed to create ICNS from ${pngPath}`)
  writeFileSync(icnsPath, icns)
}

mkdirSync(out, { recursive: true })
mkdirSync(publicDir, { recursive: true })

try {
  if (!existsSync(logoPng)) {
    throw new Error(`Logo source not found: ${logoPng}`)
  }

  copyLogo(join(out, '256x256.png'))
  copyLogo(join(out, 'icon.png'))
  copyLogo(join(out, 'tray-icon.png'))
  copyLogo(join(out, 'tray-icon@2x.png'))

  writeIcoFromPng(join(out, '256x256.png'), join(out, 'icon.ico'))
  writeIcnsFromPng(join(out, 'icon.png'), join(out, 'icon.icns'))

  copyLogo(join(publicDir, 'favicon.png'))
  writeIcoFromPng(join(publicDir, 'favicon.png'), join(publicDir, 'favicon.ico'))

  console.log('App icons generated in build/icons and src/renderer/public/')
} catch (err) {
  if (hasPrebuiltIcons()) {
    console.warn(
      'Skipping icon regeneration because source PNG is unavailable. Using existing generated icon assets.',
      err,
    )
  } else {
    throw err
  }
}
