import { getBundledToolSetTools } from '../src/main/skills/bundled-toolset'

/** Fail the build when the statically bundled toolSet catalog is empty. */
export function verifyBundledToolSetCatalog(): void {
  const tools = getBundledToolSetTools()
  if (tools.length === 0) {
    throw new Error('bundled toolSet catalog is empty after main build')
  }
  console.log(`verify: ${tools.length} bundled toolSet tools`)
}
