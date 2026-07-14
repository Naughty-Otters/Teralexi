import type { Plugin } from 'vite'

const VIRTUAL_ID = '\0teralexi-nuxt-ui-imports'
const RESOLVED_ID = VIRTUAL_ID

/**
 * @nuxt/ui's Vue Vite plugin resolves `#imports` to an absolute path under
 * node_modules (`…/runtime/vue/stubs/vue-router.js`). With Vite `root` set to
 * `src/renderer`, that file is always served as `/@fs/…`, which intermittently
 * 403s / fails to fetch in Electron until a full restart.
 *
 * Resolve `#imports` to a virtual module instead so the entry never uses `@fs`.
 * Handlers re-export the same surface as Nuxt UI's vue-router stub + base stubs.
 */
export function rendererNuxtUiImportsPlugin(): Plugin {
  return {
    name: 'teralexi:nuxt-ui-imports',
    enforce: 'pre',
    resolveId(id) {
      if (id === '#imports') return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return
      // Keep this in sync with @nuxt/ui/dist/runtime/vue/stubs/{base,vue-router}.js
      return `
import { ref, onScopeDispose } from 'vue'
import { createHooks } from 'hookable'
import { useColorMode as useColorModeVueUse } from '@vueuse/core'
import appConfig from '#build/app.config'

export { useRoute, useRouter } from 'vue-router'
export { useHead } from '@unhead/vue'
export { useAppConfig } from '@nuxt/ui/runtime/vue/composables/useAppConfig.js'
export { defineShortcuts } from '@nuxt/ui/composables/defineShortcuts'
export { defineLocale, extendLocale } from '@nuxt/ui/composables/defineLocale'
export { useLocale } from '@nuxt/ui/composables/useLocale'

export const clearError = () => {}

export const useColorMode = () => {
  if (!appConfig.colorMode) {
    return { forced: true }
  }
  const { store, system } = useColorModeVueUse()
  return {
    get preference() {
      return store.value === 'auto' ? 'system' : store.value
    },
    set preference(value) {
      store.value = value === 'system' ? 'auto' : value
    },
    get value() {
      return store.value === 'auto' ? system.value : store.value
    },
    forced: false,
  }
}

export const useCookie = (_name, _options = {}) => {
  const value = ref(_options?.default?.() ?? null)
  return {
    value: value.value,
    get: () => value.value,
    set: () => {},
    update: () => {},
    refresh: () => Promise.resolve(value.value),
    remove: () => {},
  }
}

const state = {}
export const useState = (key, init) => {
  if (state[key]) return state[key]
  const value = ref(init())
  state[key] = value
  return value
}

const hooks = createHooks()
export function useNuxtApp() {
  return {
    isHydrating: true,
    payload: { serverRendered: import.meta.env.SSR || false },
    hooks,
    hook: hooks.hook,
  }
}

export function useRuntimeHook(name, fn) {
  const nuxtApp = useNuxtApp()
  const unregister = nuxtApp.hook(name, fn)
  onScopeDispose(unregister)
}

export function useRuntimeConfig() {
  return {
    app: { baseURL: '/' },
    public: {},
  }
}

export function defineNuxtPlugin(plugin) {
  return {
    install(app) {
      app.runWithContext(() => plugin({ vueApp: app }))
    },
  }
}
`
    },
  }
}
