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
  setTrustStatusMock,
  findExtensionActionsIndexFileMock,
  loadExtensionActionsModuleMock,
  collectHooksFromModuleMock,
  collectContributionsFromModuleMock,
  loadExtensionHookExportMock,
} = vi.hoisted(() => ({
  getExtensionEnabledMock: vi.fn(() => true),
  isExtensionEnabledInMapMock: vi.fn(() => true),
  listDisabledExtensionIdsMock: vi.fn(() => new Set<string>()),
  getTrustStatusMock: vi.fn(() => 'trusted' as const),
  setTrustStatusMock: vi.fn(),
  findExtensionActionsIndexFileMock: vi.fn((_dir: string) => undefined as string | undefined),
  loadExtensionActionsModuleMock: vi.fn(async () => undefined),
  collectHooksFromModuleMock: vi.fn(() => ({})),
  collectContributionsFromModuleMock: vi.fn(() => ({})),
  loadExtensionHookExportMock: vi.fn(async () => undefined),
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
  findExtensionActionsIndexFile: findExtensionActionsIndexFileMock,
  loadExtensionActionsModule: loadExtensionActionsModuleMock,
  collectHooksFromModule: collectHooksFromModuleMock,
  collectContributionsFromModule: collectContributionsFromModuleMock,
  loadExtensionHookExport: loadExtensionHookExportMock,
}))

vi.mock('@main/services/conversation-store', () => ({
  getConversationStore: () => ({
    getExtensionEnabled: getExtensionEnabledMock,
    isExtensionEnabledInMap: isExtensionEnabledInMapMock,
    listDisabledExtensionIds: listDisabledExtensionIdsMock,
    getExtensionHookTrustRepository: () => ({
      getStatus: getTrustStatusMock,
      setStatus: setTrustStatusMock,
    }),
  }),
}))

import {
  appendConversationHookContext,
  clearExtensionHostCache,
  consumeConversationHookContext,
  ensureExtensionHostInitialized,
  getExtensionHookBindings,
  getExtensionRoot,
  initExtensionHost,
  listExtensionChannels,
  listExtensionLlmProviderSummaries,
  listExtensionUiPanels,
  listPendingHookReviews,
  registerPendingHookTrust,
  reloadExtensionHost,
} from './extension-host'

async function writeExtension(
  root: string,
  folderName: string,
  manifest: Record<string, unknown>,
  hooksJson?: Record<string, unknown>,
): Promise<string> {
  const dir = join(root, folderName)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'extension.json'), JSON.stringify(manifest))
  if (hooksJson) {
    const hooksDir = join(dir, 'hooks')
    await mkdir(hooksDir, { recursive: true })
    await writeFile(join(hooksDir, 'hooks.json'), JSON.stringify(hooksJson))
  }
  return dir
}

/** Writes a real (unused-by-mocks) actions/index.ts so the raw-content trust hash has a real file to read. */
async function writeActionsIndexFile(extensionDir: string, content = '// test\n'): Promise<string> {
  const actionsDir = join(extensionDir, 'actions')
  await mkdir(actionsDir, { recursive: true })
  const indexPath = join(actionsDir, 'index.ts')
  await writeFile(indexPath, content)
  return indexPath
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
    setTrustStatusMock.mockReset()
    findExtensionActionsIndexFileMock.mockReset().mockReturnValue(undefined)
    loadExtensionActionsModuleMock.mockReset().mockResolvedValue(undefined)
    collectHooksFromModuleMock.mockReset().mockReturnValue({})
    collectContributionsFromModuleMock.mockReset().mockReturnValue({})
    loadExtensionHookExportMock.mockReset().mockResolvedValue(undefined)
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
    const pending = await listPendingHookReviews('default')
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      extensionId: 'secret-guard',
      sourcePath: 'hooks/hooks.json',
      status: 'pending',
    })
  })

  it('loads manifest hooks and substitutes extension root placeholders', async () => {
    const dir = await writeExtension(
      bundledDir,
      'hook-judge',
      {
        id: 'hook-judge',
        version: '1.0.0',
        contributes: {
          hooks: {
            beforeToolCall: [
              {
                type: 'command',
                command: '${EXTENSION_ROOT}/scripts/check.sh',
              },
            ],
          },
        },
      },
    )

    await initExtensionHost('default')
    const bindings = await getExtensionHookBindings('default')
    expect(bindings[0]).toMatchObject({
      command: join(dir, 'scripts', 'check.sh'),
    })
  })

  it('resolves function-ref bindings from hooks.json', async () => {
    const handler = vi.fn(async () => ({ continue: true }))
    loadExtensionHookExportMock.mockResolvedValueOnce(handler)
    await writeExtension(bundledDir, 'hook-judge', { id: 'hook-judge', version: '1.0.0' }, {
      hooks: {
        beforeToolCall: [
          {
            type: 'function',
            module: '${EXTENSION_ROOT}/actions/guard.ts',
            export: 'guard',
          },
        ],
      },
    })

    await initExtensionHost('default')
    const bindings = await getExtensionHookBindings('default')
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      type: 'function',
      handler,
    })
  })

  it('registers trusted actions module contributions', async () => {
    loadExtensionActionsModuleMock.mockResolvedValueOnce({})
    collectHooksFromModuleMock.mockReturnValueOnce({
      beforeToolCall: [{ type: 'function', handler: vi.fn() }],
    })
    collectContributionsFromModuleMock.mockReturnValueOnce({
      channels: {
        log: { sendToTarget: vi.fn() },
      },
      llmProviders: {
        local: { label: 'Local', adapter: { createModel: () => ({}) } },
      },
      uiPanels: {
        settings: { label: 'Settings', component: './Settings.vue' },
      },
    })
    const dir = await writeExtension(bundledDir, 'demo-channel', { id: 'demo-channel', version: '1.0.0' })
    const actionsIndexPath = await writeActionsIndexFile(dir)
    findExtensionActionsIndexFileMock.mockReturnValueOnce(actionsIndexPath)

    await ensureExtensionHostInitialized('default')
    expect(await listExtensionChannels('default')).toEqual([
      expect.objectContaining({ registryId: 'demo-channel:log' }),
    ])
    expect(await listExtensionLlmProviderSummaries('default')).toEqual([
      expect.objectContaining({ registryId: 'demo-channel:local' }),
    ])
    expect(await listExtensionUiPanels('default')).toEqual([
      expect.objectContaining({ registryId: 'demo-channel:settings' }),
    ])
    expect(getExtensionRoot('demo-channel')).toContain('demo-channel')
  })

  it('queues pending trust for untrusted actions modules with contributions', async () => {
    loadExtensionActionsModuleMock.mockResolvedValueOnce({})
    collectHooksFromModuleMock.mockReturnValueOnce({
      beforeToolCall: [{ type: 'function', handler: vi.fn() }],
    })
    collectContributionsFromModuleMock.mockReturnValueOnce({
      channels: { log: { sendToTarget: vi.fn() } },
    })
    getTrustStatusMock.mockReturnValue('pending')
    const dir = await writeExtension(bundledDir, 'demo-channel', { id: 'demo-channel', version: '1.0.0' })
    const actionsIndexPath = await writeActionsIndexFile(dir)
    findExtensionActionsIndexFileMock.mockReturnValueOnce(actionsIndexPath)

    await initExtensionHost('default')
    expect(await getExtensionHookBindings('default')).toEqual([])
    expect(await listPendingHookReviews('default')).toHaveLength(1)
  })

  it('reuses host cache for the same user and workspace', async () => {
    await writeExtension(bundledDir, 'secret-guard', { id: 'secret-guard', version: '1.0.0' }, {
      hooks: { beforeToolCall: [{ type: 'command', command: '/bin/check' }] },
    })

    await ensureExtensionHostInitialized('default', '/workspace')
    await ensureExtensionHostInitialized('default', '/workspace')
    expect(await getExtensionHookBindings('default', '/workspace')).toHaveLength(1)
  })

  it('reloads host cache after clear', async () => {
    await writeExtension(bundledDir, 'secret-guard', { id: 'secret-guard', version: '1.0.0' }, {
      hooks: { beforeToolCall: [{ type: 'command', command: '/bin/check' }] },
    })

    await initExtensionHost('default')
    clearExtensionHostCache()
    await reloadExtensionHost('default')
    expect(await getExtensionHookBindings('default')).toHaveLength(1)
  })

  it('registers pending trust entries without overwriting trusted status', async () => {
    const reviews = [
      {
        extensionId: 'demo',
        trustKey: 'key-1',
        contentHash: 'hash-1',
        sourcePath: 'actions/index.ts',
        events: ['beforeToolCall'],
        status: 'pending' as const,
      },
    ]
    getTrustStatusMock.mockReturnValueOnce('trusted')

    registerPendingHookTrust('default', reviews)

    expect(setTrustStatusMock).not.toHaveBeenCalled()
    getTrustStatusMock.mockReturnValue('pending')
    registerPendingHookTrust('default', reviews)
    expect(setTrustStatusMock).toHaveBeenCalledWith(
      'default',
      'key-1',
      'hash-1',
      'pending',
    )
  })

  it('stores and consumes per-conversation hook context', () => {
    appendConversationHookContext('c1', ' first ')
    appendConversationHookContext('c1', 'second')
    appendConversationHookContext('', 'ignored')

    expect(consumeConversationHookContext('c1')).toEqual(['first', 'second'])
    expect(consumeConversationHookContext('c1')).toEqual([])
  })
})
