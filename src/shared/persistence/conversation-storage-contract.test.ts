import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  extractPersistedStepBodies,
  persistedStructuredContentHasStepBodies,
} from './conversation-storage-contract'
import { limitMessageContentForPersistence } from './limit-persisted-content'

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../../..')

const MAIN_PERSISTENCE_FILES = [
  'src/main/services/conversation-store/messages-repository.ts',
  'src/main/services/conversation-store/store.ts',
  'src/main/engine/conversation.ts',
  'src/main/agent/context.ts',
]

const FORBIDDEN_RENDERER_IMPORTS = [
  'structuredDebugViewModel',
  '@renderer/views/agent-chat',
  'streamingBubbleTextLimit',
  'chatUiSettings',
]

describe('conversation storage contract', () => {
  it('retains tool-loop step bodies after persistence shaping', () => {
    const toolBody = '📋 Task 1/3\n\nRan grep across src/\n\nWrote output files'
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '',
          report: '',
          pipelineConversation: [
            {
              sectionId: 'SkillsToolExecutionStep',
              stepId: 'toolLoop',
              title: 'Agentic Run',
              content: toolBody,
              status: 'completed',
            },
          ],
          stepCaptures: [
            {
              stepType: 'SkillsToolExecutionStep',
              title: 'Agentic Run',
              content: toolBody,
              outputPaths: [],
            },
          ],
        },
        subSteps: [
          {
            type: 'SkillsToolExecutionStep',
            title: 'Agentic Run',
            content: toolBody,
          },
        ],
      },
    }

    const persisted = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )

    expect(persistedStructuredContentHasStepBodies(persisted)).toBe(true)
    for (const body of extractPersistedStepBodies(persisted)) {
      expect(body).toContain('Ran grep across src/')
      expect(body).toContain('Wrote output files')
    }
  })

  it('drops ephemeral streamingText while keeping step captures', () => {
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          finalResult: '',
          report: '',
          streamingText: 'live-only stream fragment',
          stepCaptures: [
            {
              stepType: 'ThinkingStep',
              title: 'Thinking',
              content: 'Stored thinking body',
              outputPaths: [],
            },
          ],
        },
        subSteps: [],
      },
    }

    const persisted = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    const parsed = JSON.parse(persisted) as {
      assistantContent: { outer: { streamingText?: string } }
    }

    expect(parsed.assistantContent.outer.streamingText).toBeUndefined()
    expect(extractPersistedStepBodies(persisted)).toContain(
      'Stored thinking body',
    )
  })

  it('handles blank and non-structured persisted text as plain bodies', () => {
    expect(extractPersistedStepBodies('   ')).toEqual([])
    expect(persistedStructuredContentHasStepBodies('   ')).toBe(false)
    expect(extractPersistedStepBodies('plain text')).toEqual(['plain text'])
    expect(persistedStructuredContentHasStepBodies('{"version":1}')).toBe(true)
  })

  it('ignores empty step rows and extracts from all structured sections', () => {
    const payload = {
      version: 2,
      assistantContent: {
        outer: {
          pipelineConversation: [
            { content: '   ' },
            { content: 'pipeline body' },
          ],
          stepCaptures: [{ content: 'capture body' }, { content: '' }],
        },
        subSteps: [{ content: 'sub step body' }],
      },
    }

    const persisted = limitMessageContentForPersistence(
      JSON.stringify(payload),
      'assistant',
    )
    expect(extractPersistedStepBodies(persisted)).toEqual([
      'pipeline body',
      'capture body',
      'sub step body',
    ])
  })

  it('main-process persistence does not import renderer presentation modules', () => {
    for (const relPath of MAIN_PERSISTENCE_FILES) {
      const absPath = join(repoRoot, relPath)
      const src = readFileSync(absPath, 'utf8')
      for (const forbidden of FORBIDDEN_RENDERER_IMPORTS) {
        expect(
          src.includes(forbidden),
          `${relative(repoRoot, absPath)} must not reference ${forbidden}`,
        ).toBe(false)
      }
    }
  })
})
