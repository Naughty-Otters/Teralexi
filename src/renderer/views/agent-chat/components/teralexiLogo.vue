<template>
  <img
    :src="logoSrc"
    class="brand-logo-img"
    alt="Teralexi"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppIsDark } from '@renderer/composables/appColorMode'
import { teralexiLogo, teralexiLogoBright } from '@renderer/assets/icons'

const isDark = useAppIsDark()

/** Sidebar brand: bright logo on light UI, standard logo on dark UI. */
const logoSrc = computed(() => (isDark.value ? teralexiLogo : teralexiLogoBright))
</script>

<style scoped>
.brand-logo-img {
  width: 40px;
  height: 40px;
  display: block;
  object-fit: contain;
}
</style>
