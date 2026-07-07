<template>
  <div class="composer-skeleton" aria-hidden="true">
    <div class="composer-skeleton__toolbar">
      <span
        v-for="index in 4"
        :key="`chip-${index}`"
        class="composer-skeleton__chip"
      />
    </div>
    <div class="composer-skeleton__input">
      <span class="composer-skeleton__line composer-skeleton__line--lg" />
      <span class="composer-skeleton__line composer-skeleton__line--md" />
      <span class="composer-skeleton__line composer-skeleton__line--sm" />
    </div>
  </div>
</template>

<style scoped>
.composer-skeleton {
  min-height: 112px;
  padding: 10px 48px 12px 12px;
  box-sizing: border-box;
}

.composer-skeleton__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.composer-skeleton__chip,
.composer-skeleton__line {
  display: block;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ui-text) 6%, var(--ui-bg-accented)) 0%,
    color-mix(in srgb, var(--ui-text) 10%, var(--ui-bg-accented)) 50%,
    color-mix(in srgb, var(--ui-text) 6%, var(--ui-bg-accented)) 100%
  );
  background-size: 200% 100%;
  animation: composer-skeleton-shimmer 1.2s ease-in-out infinite;
}

.composer-skeleton__chip {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.composer-skeleton__chip:first-child {
  width: 72px;
  border-radius: 999px;
}

.composer-skeleton__input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.composer-skeleton__line {
  height: 10px;
  border-radius: 4px;
}

.composer-skeleton__line--lg {
  width: 88%;
}

.composer-skeleton__line--md {
  width: 62%;
}

.composer-skeleton__line--sm {
  width: 40%;
}

@keyframes composer-skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
