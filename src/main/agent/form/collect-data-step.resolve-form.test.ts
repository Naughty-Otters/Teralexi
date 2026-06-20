import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ReferenceDoc } from '../resources/reference-resource'
import { ReferenceContext } from '../resources/context'
import type { AgentStepContext } from '../context'
import { resolveTodoFormForCollection } from './collect-data-step'

const { generateFormSchemaFromContextMock } = vi.hoisted(() => ({
  generateFormSchemaFromContextMock: vi.fn(async () => ({
    title: 'Generated title',
    message: 'Generated message',
    fields: [
      {
        key: 'topic',
        label: 'Topic',
        type: 'string',
        required: true,
      },
    ],
  })),
}))

vi.mock('./generate-form-schema', () => ({
  GENERATED_FORM_DOC_NAME: 'generated.form.md',
  generateFormSchemaFromContext: (...args: unknown[]) =>
    generateFormSchemaFromContextMock(...args),
  schemaToFormMarkdown: (schema: { title?: string; fields: unknown[] }) =>
    `<!-- FORM_SCHEMA\n${JSON.stringify(schema)}\n-->`,
}))

function makeCtx(): AgentStepContext {
  return {
    references: new ReferenceContext(),
    generatedFormSchemaByTodoId: new Map(),
    sandbox: { getRoot: () => '/sandbox' },
    opts: { skillId: 'documents' },
  } as unknown as AgentStepContext
}

describe('resolveTodoFormForCollection', () => {
  beforeEach(() => {
    generateFormSchemaFromContextMock.mockClear()
  })

  it('generates schema when form_doc_name is not in reference_doc', async () => {
    const result = await resolveTodoFormForCollection(
      makeCtx(),
      {
        id: 1,
        name: 'Collect info',
        description: 'Need topic from user',
        form_doc_name: 'missing.form.md',
      } as never,
      [],
      'missing.form.md',
    )

    expect(generateFormSchemaFromContextMock).toHaveBeenCalled()
    expect(result.formDocName).toBe('missing.form.md')
    expect(result.resolvedForm.fields).toHaveLength(1)
    expect(result.markdown).toContain('FORM_SCHEMA')
  })

  it('uses cached generated schema on second resolve', async () => {
    const ctx = makeCtx()
    const todo = {
      id: 2,
      name: 'Step',
      description: 'Desc',
    } as never

    await resolveTodoFormForCollection(ctx, todo, [], undefined)
    await resolveTodoFormForCollection(ctx, todo, [], undefined)

    expect(generateFormSchemaFromContextMock).toHaveBeenCalledTimes(1)
  })

})
