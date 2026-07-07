import 'virtual:renderer-lucide-icons'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import NuxtUIPlugin from '@nuxt/ui/vue-plugin'

import { initAppColorMode } from './composables/appColorMode'
import { loadFontSettings } from './fontSettings'
import { loadAppearanceSettings } from './appearanceSettings'
import './styles/index.scss'
import './permission'
import App from './App.vue'
import router from './router'
import { errorHandler } from './error'
import './utils/hackIpcRenderer'

const app = createApp(App)
const store = createPinia()
app.use({ install: () => initAppColorMode() })
app.use(NuxtUIPlugin)
app.use(router)
app.use(store)
errorHandler(app)

void loadFontSettings()
void loadAppearanceSettings()
app.mount('#app')
