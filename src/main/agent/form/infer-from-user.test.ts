import { describe, expect, it } from 'vitest'
import { inferFormValuesFromUserMessage } from './infer-from-user'

describe('inferFormValuesFromUserMessage', () => {
  it('returns null for empty user text', async () => {
    const result = await inferFormValuesFromUserMessage({
      ctx: {} as never,
      userText: '',
      formMarkdown: '# Form\n<!-- FORM_SCHEMA\n{"fields":[{"key":"name","label":"Name","type":"text","required":true}]}\n-->',
    })
    expect(result).toBeNull()
  })

  it('returns null for empty form markdown', async () => {
    const result = await inferFormValuesFromUserMessage({
      ctx: {} as never,
      userText: 'hello',
      formMarkdown: '',
    })
    expect(result).toBeNull()
  })

  it('returns null when no fields in schema', async () => {
    const result = await inferFormValuesFromUserMessage({
      ctx: {} as never,
      userText: 'hello',
      formMarkdown: '# No schema here',
      fields: [],
    })
    expect(result).toBeNull()
  })
})
