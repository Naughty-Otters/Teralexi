import MarkdownIt from 'markdown-it'
import { configureStandardMarkdownIt } from './create-markdown-it'

/** Synchronous init for main process and unit tests — avoid on renderer startup paths. */
export function createStandardMarkdownItEager(): MarkdownIt {
  return configureStandardMarkdownIt(MarkdownIt)
}
