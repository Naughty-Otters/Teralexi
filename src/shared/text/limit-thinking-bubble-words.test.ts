import { describe, expect, it } from 'vitest'
import {
  THINKING_BUBBLE_MAX_WORDS,
  THINKING_BUBBLE_WORDS_OMISSION,
  countThinkingBubbleWords,
  limitThinkingBubbleWords,
} from './limit-thinking-bubble-words'

describe('limitThinkingBubbleWords', () => {
  it('passes through text within the word budget', () => {
    expect(limitThinkingBubbleWords('one two three', 10)).toBe('one two three')
  })

  it('keeps only the most recent words when over budget', () => {
    const words = Array.from({ length: 12 }, (_, i) => `w${i + 1}`)
    const limited = limitThinkingBubbleWords(words.join(' '), 5)
    expect(limited).toBe(`${THINKING_BUBBLE_WORDS_OMISSION}w8 w9 w10 w11 w12`)
  })

  it('defaults to a 2k-word ceiling', () => {
    const words = Array.from(
      { length: THINKING_BUBBLE_MAX_WORDS + 50 },
      (_, i) => `w${i}`,
    )
    const limited = limitThinkingBubbleWords(words.join(' '))
    const kept = limited.slice(THINKING_BUBBLE_WORDS_OMISSION.length)
    expect(countThinkingBubbleWords(kept)).toBe(THINKING_BUBBLE_MAX_WORDS)
  })
})
