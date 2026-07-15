import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugins = vi.hoisted(() => [
  {
    id: 'publish-website',
    label: 'Publish website',
    icon: 'globe',
    isEnabled: vi.fn(async () => true),
    getDisabledReason: vi.fn(async () => 'Sign in to Teralexi to publish'),
    preview: vi.fn(async () => ({
      ok: true,
      title: 'Publish website',
      siteDir: '/tmp/site',
      fileCount: 1,
      estimatedBytes: 10,
      sampleFiles: ['index.html'],
      truncatedRemaining: 0,
      targetHost: 'localhost:8000',
      uploadPath: 'api/v1/app/web/upload',
    })),
    execute: vi.fn(async () => ({
      ok: true,
      absoluteUrl: 'http://x/',
      uploadStatus: 200,
      verifyStatus: 200,
      fileCount: 1,
      bytes: 10,
    })),
  },
  {
    id: 'no-preview',
    label: 'No preview',
    icon: 'bolt',
    execute: vi.fn(async () => ({ ok: true, message: 'done' })),
  },
])

vi.mock('./bundled-skill-actions', () => ({
  getBundledSkillComposerToolbarPlugins: () => plugins,
}))

vi.mock('./skill-path', () => ({
  isLoadableSkillFolder: () => false,
  resolveUserSkillsDirectory: () => '/tmp/skills',
}))

vi.mock('./bundled-skills-manifest', () => ({
  isBundledSkillId: (id: string) => id === 'website',
}))

vi.mock('@main/agent/workspace/conversation-workspace', () => ({
  getWorkspacePath: () => '/tmp/ws',
}))

vi.mock('./skill-module-loader', () => ({
  loadComposerToolbarPluginsFromActionsDir: async () => [],
}))

import {
  invokeComposerToolbarPlugin,
  previewComposerToolbarPlugin,
} from './composer-toolbar-registry'

describe('previewComposerToolbarPlugin / invokeComposerToolbarPlugin', () => {
  beforeEach(() => {
    plugins[0]!.isEnabled.mockResolvedValue(true)
    plugins[0]!.preview.mockClear()
    plugins[0]!.execute.mockClear()
  })

  it('returns preview payload for website publish plugin', async () => {
    const preview = await previewComposerToolbarPlugin({
      skillId: 'website',
      conversationId: 'c1',
      pluginId: 'publish-website',
    })
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.siteDir).toBe('/tmp/site')
    expect(preview.sampleFiles).toEqual(['index.html'])
    expect(preview.uploadPath).toBe('api/v1/app/web/upload')
    expect(plugins[0]!.preview).toHaveBeenCalled()
  })

  it('preview fails for missing ids or unknown plugin', async () => {
    expect(
      await previewComposerToolbarPlugin({
        skillId: '',
        conversationId: 'c1',
        pluginId: 'publish-website',
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/Missing/i) })

    expect(
      await previewComposerToolbarPlugin({
        skillId: 'website',
        conversationId: 'c1',
        pluginId: 'missing',
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/Unknown/i) })
  })

  it('preview returns disabled reason without calling plugin.preview', async () => {
    plugins[0]!.isEnabled.mockResolvedValueOnce(false)
    const preview = await previewComposerToolbarPlugin({
      skillId: 'website',
      conversationId: 'c1',
      pluginId: 'publish-website',
    })
    expect(preview).toMatchObject({
      ok: false,
      error: 'Sign in to Teralexi to publish',
      title: 'Publish website',
    })
    expect(plugins[0]!.preview).not.toHaveBeenCalled()
  })

  it('preview fails when plugin has no preview hook', async () => {
    const preview = await previewComposerToolbarPlugin({
      skillId: 'website',
      conversationId: 'c1',
      pluginId: 'no-preview',
    })
    expect(preview).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no confirmation preview/i),
    })
  })

  it('invoke returns publish summary fields', async () => {
    const result = await invokeComposerToolbarPlugin({
      skillId: 'website',
      conversationId: 'c1',
      pluginId: 'publish-website',
    })
    expect(result).toMatchObject({
      ok: true,
      absoluteUrl: 'http://x/',
      uploadStatus: 200,
      verifyStatus: 200,
      fileCount: 1,
      bytes: 10,
    })
  })

  it('invoke returns disabled reason without execute', async () => {
    plugins[0]!.isEnabled.mockResolvedValueOnce(false)
    const result = await invokeComposerToolbarPlugin({
      skillId: 'website',
      conversationId: 'c1',
      pluginId: 'publish-website',
    })
    expect(result).toMatchObject({
      ok: false,
      error: 'Sign in to Teralexi to publish',
    })
    expect(plugins[0]!.execute).not.toHaveBeenCalled()
  })
})
