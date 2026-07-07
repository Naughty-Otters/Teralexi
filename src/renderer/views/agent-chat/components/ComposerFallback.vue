<template>
  <textarea
    class="composer-fallback"
    :value="modelValue"
    :placeholder="placeholder"
    rows="3"
    @input="onInput"
    @keydown="onKeydown"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
  }>(),
  { placeholder: 'Message…' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
}>()

function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLTextAreaElement)) return
  emit('update:modelValue', target.value)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  emit('submit')
}
</script>

<style scoped>
.composer-fallback {
  display: block;
  width: 100%;
  min-height: 72px;
  padding: 12px 48px 12px 14px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}
.composer-fallback:focus {
  outline: none;
}
.composer-fallback::placeholder {
  color: var(--ui-text-muted);
}
</style>
