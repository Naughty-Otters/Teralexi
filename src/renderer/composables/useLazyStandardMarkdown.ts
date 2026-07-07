import { shallowRef, type ShallowRef } from 'vue'
import type MarkdownIt from 'markdown-it'
import { getStandardMarkdownIt } from '@shared/markdown/create-markdown-it'

const sharedMarkdown: ShallowRef<MarkdownIt | null> = shallowRef(null)
let loadStarted = false

/** Starts loading standard markdown-it once; returns a shared ref for all consumers. */
export function useLazyStandardMarkdown(): ShallowRef<MarkdownIt | null> {
  if (!loadStarted) {
    loadStarted = true
    void getStandardMarkdownIt().then((md) => {
      sharedMarkdown.value = md
    })
  }
  return sharedMarkdown
}
