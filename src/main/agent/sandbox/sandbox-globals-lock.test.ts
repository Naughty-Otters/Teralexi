import { afterEach, describe, expect, it } from 'vitest'
import { getSandboxRootFromEnv } from './paths'
import {
  OTTER_AGENT_SANDBOX_ROOT_ENV,
  SANDBOX_ROOT_GLOBAL_KEY,
} from './run-context'
import { runWithExclusiveSandboxGlobals, resetSandboxGlobalsLockForTests } from './sandbox-globals-lock'

function clearSandboxGlobals(): void {
  delete process.env[OTTER_AGENT_SANDBOX_ROOT_ENV]
  delete (globalThis as Record<string, unknown>)[SANDBOX_ROOT_GLOBAL_KEY]
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('runWithExclusiveSandboxGlobals', () => {
  afterEach(() => {
    clearSandboxGlobals()
    resetSandboxGlobalsLockForTests()
  })

  it('applies bindings for the duration of fn', async () => {
    await runWithExclusiveSandboxGlobals(
      () => ({ root: '/sandbox-a' }),
      async () => {
        expect(getSandboxRootFromEnv()).toBe('/sandbox-a')
      },
    )
    expect(getSandboxRootFromEnv()).toBeUndefined()
  })

  it('deadlocks when fn awaits a nested exclusive run', async () => {
    await expect(
      Promise.race([
        runWithExclusiveSandboxGlobals(
          () => ({ root: '/outer' }),
          async () => {
            await runWithExclusiveSandboxGlobals(
              () => ({ root: '/inner' }),
              async () => {},
            )
          },
        ),
        delay(150).then(() => {
          throw new Error('nested exclusive run deadlock')
        }),
      ]),
    ).rejects.toThrow('nested exclusive run deadlock')
  })

  it('serializes concurrent runs so each sees its own root', async () => {
    const observed: Array<{ who: string; root: string | undefined }> = []

    await Promise.all([
      runWithExclusiveSandboxGlobals(
        () => ({ root: '/run-a' }),
        async () => {
          observed.push({ who: 'a-start', root: getSandboxRootFromEnv() })
          await delay(20)
          observed.push({ who: 'a-end', root: getSandboxRootFromEnv() })
        },
      ),
      runWithExclusiveSandboxGlobals(
        () => ({ root: '/run-b' }),
        async () => {
          await delay(5)
          observed.push({ who: 'b', root: getSandboxRootFromEnv() })
        },
      ),
    ])

    for (const entry of observed) {
      if (entry.who.startsWith('a')) {
        expect(entry.root).toBe('/run-a')
      } else {
        expect(entry.root).toBe('/run-b')
      }
    }
  })
})
