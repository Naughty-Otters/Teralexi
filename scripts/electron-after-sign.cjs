const { execSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

function isMacCodeSigningConfigured() {
  return Boolean(process.env.CSC_NAME?.trim() || process.env.CSC_LINK?.trim())
}

/**
 * electron-builder signs after afterPack; ad-hoc signatures can be inconsistent on
 * recent macOS. Re-sign here (afterSign, before dmg/zip) for unsigned builds.
 */
async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (isMacCodeSigningConfigured()) return

  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  if (!existsSync(appPath)) return

  execSync(`codesign --force --deep --sign - ${JSON.stringify(appPath)}`, {
    stdio: 'inherit',
  })
  console.log(`[afterSign] ad-hoc re-signed unsigned macOS app: ${appPath}`)
}

module.exports = afterSign
module.exports.isMacCodeSigningConfigured = isMacCodeSigningConfigured
