import { describe, expect, it } from 'vitest'
import { rendererNuxtUiImportsPlugin } from './renderer-nuxt-ui-imports'

describe('rendererNuxtUiImportsPlugin', () => {
  it('resolves #imports to a virtual module id (not an @fs absolute stub)', () => {
    const plugin = rendererNuxtUiImportsPlugin()
    const resolved = plugin.resolveId?.call(
      { meta: {} } as never,
      '#imports',
      undefined,
      { attributes: {}, isEntry: false },
    )
    expect(resolved).toBe('\0teralexi-nuxt-ui-imports')
  })

  it('loads virtual #imports with vue-router and useAppConfig exports', () => {
    const plugin = rendererNuxtUiImportsPlugin()
    const source = plugin.load?.call(
      { meta: {} } as never,
      '\0teralexi-nuxt-ui-imports',
    )
    expect(typeof source).toBe('string')
    expect(source).toContain("from 'vue-router'")
    expect(source).toContain('useAppConfig')
    expect(source).not.toContain('stubs/vue-router')
  })

  it('ignores unrelated ids', () => {
    const plugin = rendererNuxtUiImportsPlugin()
    expect(
      plugin.resolveId?.call(
        { meta: {} } as never,
        'vue-router',
        undefined,
        { attributes: {}, isEntry: false },
      ),
    ).toBeUndefined()
    expect(plugin.load?.call({ meta: {} } as never, 'vue-router')).toBeUndefined()
  })
})
