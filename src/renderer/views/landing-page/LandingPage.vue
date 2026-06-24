<template>
  <div id="wrapper">
    <img id="logo" :src="openfdeLogo" alt="OpenFDE" />
    <main>
      <div class="left-side">
        <span class="title">
          {{ i18nt.landing.welcome }}
        </span>
        <system-information></system-information>
      </div>

      <div class="right-side">
        <section class="setup-hero">
          <h2 class="setup-hero-title">{{ i18nt.providerSetup.landing.title }}</h2>
          <p class="setup-hero-subtitle">{{ i18nt.providerSetup.landing.subtitle }}</p>
          <button type="button" class="setup-hero-cta" @click="startSetup">
            {{ i18nt.providerSetup.landing.cta }}
          </button>
          <p class="setup-hero-note">
            {{ i18nt.providerSetup.wizard.subtitle }}
          </p>
        </section>

        <div class="doc doc--secondary">
          <div class="title alt">{{ i18nt.landing.buttonTips }}</div>
          <button class="btu" @click="goHome">
            {{ i18nt.providerSetup.wizard.continue }}
          </button>
          <button class="btu btu--muted" @click="changeLanguage">
            {{ i18nt.landing.buttons.changeLanguage }}
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import SystemInformation from './components/system-info-mation.vue'
import { openfdeLogo } from '@renderer/assets/icons'
import { i18nt, setLanguage, globalLang, getSupportedLocales } from '@renderer/i18n'
import { useRouter } from 'vue-router'
import { requestProviderSetupWizardOnNextChatLoad } from '@renderer/lib/provider-setup-session'

const router = useRouter()

function changeLanguage() {
  const ids = getSupportedLocales().map((entry) => entry.id)
  const index = ids.indexOf(globalLang.value)
  setLanguage(ids[(index + 1) % ids.length] ?? 'en')
}

function goHome() {
  void router.push('/')
}

function startSetup() {
  requestProviderSetupWizardOnNextChatLoad()
  void router.push('/')
}
</script>

<style scoped lang="scss">
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

#wrapper {
  padding: 124px 80px;
}

#logo {
  height: auto;
  margin-bottom: 20px;
  max-width: min(280px, 100%);
  width: 100%;
}

main {
  display: flex;
  justify-content: space-between;
  gap: 48px;
}

main > div {
  flex-basis: 50%;
}

.left-side {
  display: flex;
  flex-direction: column;
}

.title {
  color: #2c3e50;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 6px;
}

.title.alt {
  font-size: 18px;
  margin-bottom: 10px;
}

.setup-hero {
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #dbe2ea;
  background: #fff;
  margin-bottom: 20px;
}

.setup-hero-title {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 650;
  color: #0f172a;
}

.setup-hero-subtitle {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.55;
  color: #475569;
}

.setup-hero-cta {
  display: inline-block;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: #fff;
  background: #409eff;
}

.setup-hero-cta:hover {
  background: #3a8ee6;
}

.setup-hero-note {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: #64748b;
}

.doc {
  margin-bottom: 10px;

  button {
    margin-top: 10px;
    margin-right: 10px;
  }

  .btu {
    display: inline-block;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    color: #fff;
    background-color: #409eff;
    border: 1px solid #409eff;
    text-align: center;
    outline: none;
    font-weight: 500;
    padding: 12px 20px;
    font-size: 14px;
    border-radius: 4px;
  }

  .btu--muted {
    background: #64748b;
    border-color: #64748b;
  }

  .btu:focus,
  .btu:hover {
    filter: brightness(1.05);
  }
}
</style>
