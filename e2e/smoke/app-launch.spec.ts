import { test, expect } from '@playwright/test'
import {
  closeTeralexiApp,
  launchTeralexiApp,
  type ElectronAppHarness,
} from '../fixtures/electron-app'

let harness: ElectronAppHarness | null = null

test.describe('Teralexi app launch', () => {
  test.beforeAll(async () => {
    harness = await launchTeralexiApp()
  })

  test.afterAll(async () => {
    if (harness) {
      await closeTeralexiApp(harness)
      harness = null
    }
  })

  test('opens the main window', async () => {
    const window = harness!.window
    await expect(window).toHaveTitle(/Teralexi/i)
  })

  test('lands on the chat shell route', async () => {
    const window = harness!.window
    await expect
      .poll(async () => window.url(), { timeout: 30_000 })
      .toMatch(/#\/($|\?)/)
    await expect(window.locator('.agent-app, .chat-panel, .sidebar')).toBeVisible({
      timeout: 30_000,
    })
  })
})
