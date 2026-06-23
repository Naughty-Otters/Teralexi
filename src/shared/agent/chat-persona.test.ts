import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_CHAT_DISPLAY_NAME,
  assistantBubbleActivityLabel,
  assistantBubbleSpeakerName,
  assistantStepProgressDisplayTitle,
} from './chat-persona'

describe('chat-persona', () => {
  it('uses OpenFDE as the speaker name', () => {
    expect(ASSISTANT_CHAT_DISPLAY_NAME).toBe('OpenFDE')
    expect(assistantBubbleSpeakerName()).toBe('OpenFDE')
    expect(assistantStepProgressDisplayTitle()).toBe('OpenFDE')
  })

  it('returns human activity labels while running', () => {
    expect(assistantBubbleActivityLabel('ThinkingStep', 'running')).toBe(
      'thinking…',
    )
    expect(assistantBubbleActivityLabel('toolLoop', 'running')).toBe(
      'working on it…',
    )
    expect(assistantBubbleActivityLabel('unknown', 'running')).toBe('typing…')
  })

  it('returns human activity labels when done', () => {
    expect(assistantBubbleActivityLabel('finalResult', 'done')).toBe('replied')
    expect(assistantBubbleActivityLabel('PlanningStep', 'done')).toBe(
      'explored the options',
    )
    expect(assistantBubbleActivityLabel('SkillsToolExecutionStep', 'done')).toBe(
      '',
    )
  })

  it('labels attachment sections naturally', () => {
    expect(
      assistantBubbleActivityLabel('files', 'done', { attachments: true }),
    ).toBe('shared some files')
  })
})
