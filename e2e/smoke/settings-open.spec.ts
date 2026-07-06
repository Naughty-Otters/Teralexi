import { test, expect } from '@playwright/test'
import {
  closeTeralexiApp,
  launchTeralexiApp,
  type ElectronAppHarness,
} from '../fixtures/electron-app'

let harness: ElectronAppHarness | null = null

test.describe('Teralexi settings shell', () => {
  test.beforeAll(async () => {
    harness = await launchTeralexiApp()
  })

  test.afterAll(async () => {
    if (harness) {
      await closeTeralexiApp(harness)
      harness = null
    }
  })

  test('can open settings from the sidebar', async () => {
    const window = harness!.window
    const settingsButton = window.getByRole('button', {
      name: /settings/i,
    })
    await expect(settingsButton.first()).toBeVisible({ timeout: 30_000 })
    await settingsButton.first().click()
    await expect(
      window.locator('.settings-panel, [data-testid="settings-panel"]'),
    ).toBeVisible({ timeout: 15_000 })
  })
})
