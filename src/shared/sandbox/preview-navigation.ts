function stripUrlHash(url: string): string {
  const hashIndex = url.indexOf('#')
  return hashIndex >= 0 ? url.slice(0, hashIndex) : url
}

/** True when navigation should stay on the app shell (not a sandbox preview). */
export function isAppShellNavigationUrl(
  targetUrl: string,
  appShellUrl: string,
): boolean {
  const targetBase = stripUrlHash(targetUrl)
  const shellBase = stripUrlHash(appShellUrl)

  if (
    appShellUrl.startsWith('http://') ||
    appShellUrl.startsWith('https://')
  ) {
    if (!targetUrl.startsWith('file://')) {
      try {
        const target = new URL(targetUrl)
        const shell = new URL(appShellUrl)
        return (
          target.origin === shell.origin && target.pathname === shell.pathname
        )
      } catch {
        return false
      }
    }
    return false
  }

  if (targetUrl.startsWith('file://')) {
    return targetBase === shellBase
  }

  return false
}

export function shouldInterceptSandboxPreviewNavigation(
  targetUrl: string,
  appShellUrl: string,
): boolean {
  const trimmed = targetUrl.trim()
  if (!trimmed.toLowerCase().startsWith('file://')) return false
  return !isAppShellNavigationUrl(trimmed, appShellUrl)
}
