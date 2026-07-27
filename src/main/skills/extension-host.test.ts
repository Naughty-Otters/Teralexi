import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let bundledDir: string
let userDir: string
let projectDir: string

const {
  getExtensionEnabledMock,
  isExtensionEnabledInMapMock,
  listDisabledExtensionIdsMock,
  getTrustStatusMock,
} = vi.hoisted(() => ({
  getExtensionEnabledMock: vi.fn(() => true),
  isExtensionEnabledInMapMock: vi.fn(() => true),
  listDisabledExtensionIdsMock: vi.fn(() => new Set<string>()),
  getTrustStatusMock: vi.fn(() => 'trusted' as const),
}))

vi.mock('./extensions-directory-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./extensions-directory-loader')>()
  return {
    ...actual,
    listExtensions: (workspacePath?: string) => actual.listExtensions(workspacePath),
  }
})

vi.mock('./skill-path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./skill-path')>()
  return {
    ...actual,
    resolveBundledExtensionsDirectory: () => bundledDir,
    resolveProjectExtensionsDirectory: () => projectDir,
    resolveUserExtensionsDirectory: () => userDir,
  }
})

vi.mock('./skill-module-loader', () => ({
  loadExtensionActionsModule: vi.fn(async () => undefined),
  collectHooksFromModule: vi.fn(() => ({})),
  collectContributionsFromModule: vi.fn(() => ({})),
  loadExtensionHookExport: vi.fn(async () => undefined),
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getExtensionEnabled: getExtensionEnabledMock,
    isExtensionEnabledInMap: isExtensionEnabledInMapMock,
    listDisabledExtensionIds: listDisabledExtensionIdsMock,
    getExtensionHookTrustRepository: () => ({
      getStatus: getTrustStatusMock,
    }),
  }),
}))

import {
  clearExtensionHostCache,
  getExtensionHookBindings,
  initExtensionHost,
} from './extension-host'

async function writeExtension(
  root: string,
  folderName: string,
  manifest: Record<string, unknown>,
  hooksJson?: Record<string, unknown>,
): Promise<void> {
  const dir = join(root, folderName)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'extension.json'), JSON.stringify(manifest))
  if (hooksJson) {
    const hooksDir = join(dir, 'hooks')
    await mkdir(hooksDir, { recursive: true })
    await writeFile(join(hooksDir, 'hooks.json'), JSON.stringify(hooksJson))
  }
}

describe('extension-host', () => {
  beforeEach(async () => {
    clearExtensionHostCache()
    bundledDir = await mkdtemp(join(tmpdir(), 'ext-host-bundled-'))
    userDir = await mkdtemp(join(tmpdir(), 'ext-host-user-'))
    projectDir = await mkdtemp(join(tmpdir(), 'ext-host-project-'))
    getExtensionEnabledMock.mockReset().mockReturnValue(true)
    isExtensionEnabledInMapMock.mockReset().mockReturnValue(true)
    listDisabledExtensionIdsMock.mockReset().mockReturnValue(new Set())
    getTrustStatusMock.mockReset().mockReturnValue('trusted')
  })

  it('skips disabled extensions', async () => {
    await writeExtension(bundledDir, 'secret-guard', { id: 'secret-guard', version: '1.0.0' }, {
      hooks: { beforeToolCall: [{ type: 'command', command: 'node' }] },
    })
    isExtensionEnabledInMapMock.mockReturnValue(false)

    await initExtensionHost('default')
    const bindings = await getExtensionHookBindings('default')
    expect(bindings).toEqual([])
  })

  it('loads trusted extension hooks from hooks/hooks.json', async () => {
    await writeExtension(bundledDir, 'secret-guard', { id: 'secret-guard', version: '1.0.0' }, {
      hooks: { PreToolUse: [{ type: 'command', command: '/bin/check' }] },
    })

    await initExtensionHost('default')
    const bindings = await getExtensionHookBindings('default')
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      event: 'beforeToolCall',
      command: '/bin/check',
      source: 'extension-hooks-json',
    })
  })

  it('does not load hooks when trust status is pending', async () => {
    await writeExtension(bundledDir, 'secret-guard', { id: 'secret-guard', version: '1.0.0' }, {
      hooks: { beforeToolCall: [{ type: 'command', command: '/bin/check' }] },
    })
    getTrustStatusMock.mockReturnValue('pending')

    await initExtensionHost('default')
    const bindings = await getExtensionHookBindings('default')
    expect(bindings).toEqual([])
  })
})
