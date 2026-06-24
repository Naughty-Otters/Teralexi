import { describe, expect, it } from 'vitest'
import {
  isAppShellNavigationUrl,
  shouldInterceptSandboxPreviewNavigation,
} from './preview-navigation'

describe('preview-navigation', () => {
  const devShell = 'http://localhost:5173/'
  const prodShell =
    'file:///Applications/OpenFDE.app/Contents/Resources/app/dist/electron/renderer/index.html'

  it('allows dev shell http navigation', () => {
    expect(
      isAppShellNavigationUrl('http://localhost:5173/', devShell),
    ).toBe(true)
    expect(
      isAppShellNavigationUrl('http://localhost:5173/#/chat', devShell),
    ).toBe(true)
  })

  it('treats file urls as preview when app shell is http', () => {
    expect(
      shouldInterceptSandboxPreviewNavigation(
        'file:///tmp/sandbox/output/report.html',
        devShell,
      ),
    ).toBe(true)
  })

  it('allows packaged app shell file navigation', () => {
    expect(
      isAppShellNavigationUrl(prodShell, prodShell),
    ).toBe(true)
    expect(
      shouldInterceptSandboxPreviewNavigation(prodShell, prodShell),
    ).toBe(false)
  })

  it('blocks sandbox file navigation in packaged app', () => {
    expect(
      shouldInterceptSandboxPreviewNavigation(
        'file:///Users/me/Library/Application Support/OpenFDE/sandbox/output/report.html',
        prodShell,
      ),
    ).toBe(true)
  })
})
