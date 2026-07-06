import { test, expect } from '@playwright/test'
import {
  closeTeralexiApp,
  launchTeralexiApp,
  type ElectronAppHarness,
} from '../fixtures/electron-app'

let harness: ElectronAppHarness | null = null

test.describe('Teralexi chat shell', () => {
  test.beforeAll(async () => {
    harness = await launchTeralexiApp()
  })

  test.afterAll(async () => {
    if (harness) {
      await closeTeralexiApp(harness)
      harness = null
    }
  })

  test('shows the composer input', async () => {
    const window = harness!.window
    const composer = window.locator(
      'textarea, [contenteditable="true"], .chat-composer textarea',
    )
    await expect(composer.first()).toBeVisible({ timeout: 30_000 })
  })
})
