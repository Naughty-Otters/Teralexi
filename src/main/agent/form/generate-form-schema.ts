/**
 * LLM-based form schema generation.
 *
 * Used when form collection runs but no matching
 * predefined form file can be found. The LLM generates a {@link ParsedCollectFormSchema}
 * from the todo's name, description, and optional form name hint.
 */
import { Output } from '@openfde-ai'
import type { StreamTextParams } from '../llm/runtime'
import { z } from 'zod'
import type { AgentStepContext } from '../context'
import type { TodoItem } from '../types'
import type { ParsedCollectFormSchema } from './schema'
import { isUserFacingFormField } from './form-user-field-policy'
import { createLogger } from '@main/logger'

const log = createLogger('form.generate-schema')

/** Basename shown in UI when no skill `.form.md` file exists. */
export const GENERATED_FORM_DOC_NAME = 'generated.form.md'

/** Cap dynamic forms so the chat UI stays usable. */
export const MAX_GENERATED_FORM_FIELDS = 12

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/i

const generateSchemaOutputSpec = (Output.object as any)({
  schema: z.object({
    title: z.string().optional().describe('Short title shown above the form'),
    message: z
      .string()
      .optional()
      .describe('One-sentence description of what the form collects'),
    fields: z
      .array(
        z.object({
          key: z
            .string()
            .describe('camelCase or snake_case identifier used as the JSON key'),
          label: z
            .string()
            .describe(
              'Human-readable label for a USER-facing input only (not verification or agent execution)',
            ),
          type: z
            .enum(['string', 'text', 'number', 'boolean', 'select'])
            .describe(
              'Field type: string (single line), text (multi-line), number, boolean (checkbox), select (dropdown)',
            ),
          required: z
            .boolean()
            .optional()
            .describe('Whether the field must be filled before submitting'),
          placeholder: z
            .string()
            .optional()
            .describe('Placeholder text shown inside empty field'),
          options: z
            .array(
              z.object({
                value: z.string().describe('Machine-readable option value'),
                label: z.string().describe('Human-readable option label'),
              }),
            )
            .optional()
            .describe('Required when type is "select". List of choices.'),
        }),
      )
      .describe(
        'Ordered USER-facing form fields only. Never include verification, success criteria, execution mode, or agent planning fields.',
      ),
  }),
}) as any

type GeneratedFieldInput = {
  key: string
  label: string
  type: 'string' | 'text' | 'number' | 'boolean' | 'select'
  required?: boolean
  placeholder?: string
  options?: Array<{ value: string; label: string }>
}

/** Normalize LLM output: dedupe keys, cap count, ensure select options. */
export function normalizeGeneratedFormSchema(
  parsed: {
    title?: string
    message?: string
    fields?: GeneratedFieldInput[]
  },
  todoItem: Pick<TodoItem, 'name' | 'description'>,
): ParsedCollectFormSchema {
  const title = parsed.title?.trim()
  const message = parsed.message?.trim()
  const seen = new Set<string>()
  const fields: ParsedCollectFormSchema['fields'] = []

  for (const f of parsed.fields ?? []) {
    if (!f || typeof f.key !== 'string' || typeof f.label !== 'string') continue
    const key = f.key.trim()
    const label = f.label.trim()
    if (!key || !KEY_PATTERN.test(key) || seen.has(key)) continue
    if (!isUserFacingFormField({ key, label })) {
      log.debug('Dropped non-user-facing generated form field', { key, label })
      continue
    }
    seen.add(key)

    let type = f.type
    if (type === 'select') {
      const options = (f.options ?? []).filter(
        (o) => o?.value?.trim() && o?.label?.trim(),
      )
      if (options.length === 0) {
        type = 'string'
      } else {
        fields.push({
          key,
          label: f.label.trim(),
          type: 'select',
          ...(typeof f.required === 'boolean' ? { required: f.required } : {}),
          ...(f.placeholder?.trim() ? { placeholder: f.placeholder.trim() } : {}),
          options: options.map((o) => ({
            value: o.value.trim(),
            label: o.label.trim(),
          })),
        })
        if (fields.length >= MAX_GENERATED_FORM_FIELDS) break
        continue
      }
    }

    fields.push({
      key,
      label: f.label.trim(),
      type,
      ...(typeof f.required === 'boolean' ? { required: f.required } : {}),
      ...(f.placeholder?.trim() ? { placeholder: f.placeholder.trim() } : {}),
    })
    if (fields.length >= MAX_GENERATED_FORM_FIELDS) break
  }

  const schema: ParsedCollectFormSchema = {
    ...(title ? { title } : {}),
    ...(message ? { message } : {}),
    fields,
  }

  if (schema.fields.length === 0) {
    schema.title = schema.title ?? todoItem.name
    schema.message =
      schema.message ?? 'Please provide the required information to proceed.'
    schema.fields = [
      {
        key: 'user_input',
        label: 'Additional information',
        type: 'text',
        required: true,
        placeholder: 'Describe what you need...',
      },
    ]
  }

  return schema
}

/**
 * Generate a {@link ParsedCollectFormSchema} for a todo that has no predefined form file.
 * The schema is derived from the todo's `name`, `description`, and optional `form_doc_name` hint.
 */
export async function generateFormSchemaFromContext(
  ctx: AgentStepContext,
  todoItem: TodoItem,
): Promise<ParsedCollectFormSchema> {
  const formHint = todoItem.form_doc_name
    ? `The form is intended for: ${todoItem.form_doc_name.replace(/\.form\.md$/, '').replace(/[-_]/g, ' ')}.`
    : ''

  const latestUserMessage = ctx.getLatestUserMessageContent?.()?.trim() ?? ''

  const userContent = [
    latestUserMessage
      ? `User request (primary — form fields must help satisfy this):\n${latestUserMessage}`
      : '',
    `Task name: ${todoItem.name}`,
    `Task description (agent instructions — do NOT turn verification/execution wording into form fields): ${todoItem.description}`,
    formHint,
  ]
    .filter(Boolean)
    .join('\n\n')

  log.debug('generating form schema for todo', { todoId: todoItem.id, name: todoItem.name })

  const { output: parsed } = await ctx.providers.streamObjectToStepProgress<{
    title?: string
    message?: string
    fields?: Array<{
      key: string
      label: string
      type: 'string' | 'text' | 'number' | 'boolean' | 'select'
      required?: boolean
      placeholder?: string
      options?: Array<{ value: string; label: string }>
    }>
  }>(ctx, {
    system: ctx.config.withResponseLanguageInstruction(
      `You are a UI form schema generator. Collect only **user-facing** inputs the end user must supply (files, choices, titles, data sources, preferences).

NEVER add form fields for agent/system concerns, including:
- How to verify or validate a step, success criteria, acceptance rubrics
- Execution mode, planning decisions, fallback/retry strategy
- Internal context, pipeline state, or "confirm before running tools"
- References, scripts, or sandbox paths the agent already has on the todo

The task description may mention verification and execution — treat those as instructions for the agent, not fields for the user.

Rules:
- Fields must relate to the user's request and what only the user can provide.
- Use the fewest fields genuinely necessary.
- Each field key must be camelCase or snake_case (no spaces).
- Mark fields as required only when truly mandatory for the user's goal.
- For "select" fields, include a complete list of options.
- Output: one valid JSON object matching the schema.`,
      ctx.opts.responseLanguage,
    ),
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
    output: generateSchemaOutputSpec,
    abortSignal: ctx.opts.abortSignal,
  } as StreamTextParams)

  return normalizeGeneratedFormSchema(
    {
      title: parsed?.title,
      message: parsed?.message,
      fields: parsed?.fields,
    },
    todoItem,
  )
}

/**
 * Serialise a {@link ParsedCollectFormSchema} back to the `<!-- FORM_SCHEMA {...} -->` markdown
 * format so it can be passed through the existing {@link resolveCollectFormFromMarkdown} pipeline.
 */
export function schemaToFormMarkdown(schema: ParsedCollectFormSchema): string {
  return `<!-- FORM_SCHEMA\n${JSON.stringify(schema, null, 2)}\n-->`
}
