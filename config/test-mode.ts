/** True when the desktop app or E2E harness runs in integration-test mode. */
export function isTeralexiTestMode(): boolean {
  const raw = process.env.TERALEXI_TEST_MODE?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}
