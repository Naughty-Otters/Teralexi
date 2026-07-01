/** Infer which desktop targets electron-builder will produce from CLI args. */
export function detectElectronBuilderTargets(
  userArgs: readonly string[],
  platform: NodeJS.Platform = process.platform,
): { buildingMac: boolean; buildingWin: boolean; buildingLinux: boolean } {
  const buildingMac = userArgs.some(
    (arg) => arg === '--mac' || arg.startsWith('--mac='),
  )
  const buildingWin = userArgs.some(
    (arg) =>
      arg === '--win' ||
      arg.startsWith('--win=') ||
      arg.includes('--win ') ||
      userArgs.includes('--x64') ||
      userArgs.includes('--ia32'),
  )
  const buildingLinux = userArgs.some(
    (arg) => arg === '--linux' || arg.startsWith('--linux='),
  )

  if (buildingMac || buildingWin || buildingLinux) {
    return { buildingMac, buildingWin, buildingLinux }
  }

  // `npm run build` with no --mac/--win/--linux → current host platform.
  return {
    buildingMac: platform === 'darwin',
    buildingWin: platform === 'win32',
    buildingLinux: platform === 'linux',
  }
}
