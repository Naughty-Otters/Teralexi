import { Output } from '@teralexi-ai'
import type { StreamTextParams } from '../llm/runtime'
import { z } from 'zod'
import type { AgentStepContext } from '../context'
import { createLogger } from '@main/logger'
import {
  type CollectFormField,
  formValuesSatisfyRequired,
  parseFormFieldsFromMarkdown,
  resolveSelectValue,
} from './schema'

const log = createLogger('form.infer-from-user')

const inferValuesOutputSpec = (Output.object as any)({
  schema: z.object({
    values: z
      .record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      )
      .describe(
        'Form answers keyed by field key. Use null or omit keys not stated in the user message.',
      ),
  }),
}) as any

function normalizeInferredValues(
  fields: CollectFormField[],
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    const v = raw[field.key]
    if (v === undefined || v === null) continue
    if (field.type === 'boolean') {
      if (v === true || v === 'true') out[field.key] = true
      else if (v === false || v === 'false') out[field.key] = false
    } else if (field.type === 'number') {
      const n = Number(v)
      if (!Number.isNaN(n)) out[field.key] = n
    } else if (field.type === 'select') {
      const resolved = resolveSelectValue(field, v)
      if (resolved !== undefined) out[field.key] = resolved
    } else {
      const s = String(v).trim()
      if (s) out[field.key] = s
    }
  }
  return out
}

function fieldTypeExtractionHint(field: CollectFormField): string {
  switch (field.type) {
    case 'boolean':
      return (
        'boolean — set true only when the user clearly agrees, confirms, or ' +
        'requests proceeding with what this field describes; otherwise omit or false.'
      )
    case 'number':
      return 'number — parse the numeric value the user stated.'
    case 'text':
      return (
        'text — use the user’s wording when they supplied this information; ' +
        'preserve line breaks if present.'
      )
    case 'select': {
      const choices =
        field.options?.map((o) => `"${o.value}" (${o.label})`).join(', ') ??
        '(no options)'
      return (
        `select — choose exactly one allowed value: ${choices}. ` +
        'Return the option `value`, not the display label, when they differ.'
      )
    }
    default:
      return (
        'string — use the exact value from the user message (quoted or unquoted); ' +
        'preserve spaces, punctuation, and arguments. Do not truncate or substitute.'
      )
  }
}

function buildFieldExtractionInstructions(fields: CollectFormField[]): string {
  return fields
    .map((f) => {
      const req = f.required ? 'required' : 'optional'
      const placeholder = f.placeholder?.trim()
        ? ` Placeholder hint: "${f.placeholder.trim()}".`
        : ''
      return (
        `- **${f.key}** (${f.label}; ${req}; ${f.type}): ` +
        `${fieldTypeExtractionHint(f)}${placeholder}`
      )
    })
    .join('\n')
}

async function inferValuesWithLlm(params: {
  ctx: AgentStepContext
  fields: CollectFormField[]
  userText: string
  formMarkdown: string
}): Promise<Record<string, unknown>> {
  const { ctx, fields, userText, formMarkdown } = params
  const fieldInstructions = buildFieldExtractionInstructions(fields)
  const requiredKeys = fields.filter((f) => f.required).map((f) => f.key)

  const { output: parsed } = await ctx.providers.streamObjectToStepProgress<{
    values?: Record<string, unknown>
  }>(ctx, {
    instructions: ctx.config.withResponseLanguageInstruction(
      `You extract structured form values from a user message.

Read the form document for field meaning, then map the user message onto these keys:

${fieldInstructions}

Output rules:
- Return JSON: \`{ "values": { "<key>": <value>, ... } }\` using **only** the keys listed above.
- Infer values the user explicitly stated or clearly implied; use each field’s **label** and the form document to decide what counts as a match.
- Do not invent values. Omit keys (or use null) when the user did not provide them.
- Required keys for this form: ${requiredKeys.length > 0 ? requiredKeys.join(', ') : '(none)'}.
- When the user’s intent satisfies a required boolean confirmation field together with the main inputs they named, include those booleans as true.

The application will skip the form UI only if every required field has a value after extraction; otherwise the user sees the form.`,
      ctx.opts.responseLanguage,
    ),
    messages: [
      {
        role: 'user',
        content: [
          `Form document:\n${formMarkdown.trim().slice(0, 4000)}`,
          `\nUser message:\n${userText.trim()}`,
          '\nExtract `values` for the form fields defined above.',
        ].join('\n\n'),
      },
    ],
    output: inferValuesOutputSpec,
    abortSignal: ctx.opts.abortSignal,
  } as StreamTextParams)

  const raw = parsed?.values ?? {}
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v !== null && v !== undefined) cleaned[k] = v
  }
  return cleaned
}

/**
 * Parses FORM_SCHEMA from the form doc, uses an LLM to extract values from the
 * user message, then skips the form UI only when every required field is filled.
 */
export async function inferFormValuesFromUserMessage(params: {
  ctx: AgentStepContext
  userText: string
  formMarkdown: string
 /** When set, used instead of re-parsing (includes resolved `optionsFrom`). */
  fields?: CollectFormField[]
}): Promise<Record<string, unknown> | null> {
  const { ctx, userText, formMarkdown, fields: resolvedFields } = params
  const user_input = userText.trim()
  const markdown = formMarkdown.trim()
  if (!user_input || !markdown) return null

  const fields =
    resolvedFields ??
    parseFormFieldsFromMarkdown(markdown)
  if (fields.length === 0) return null

  try {
    const llmRaw = await inferValuesWithLlm({
      ctx,
      fields,
      userText: user_input,
      formMarkdown: markdown,
    })
    const values = normalizeInferredValues(fields, llmRaw)

    if (!formValuesSatisfyRequired(fields, values)) {
      const missing = fields
        .filter((f) => f.required)
        .filter((f) => {
          const v = values[f.key]
          if (f.type === 'boolean') return v !== true
          return v === undefined || v === null || String(v).trim() === ''
        })
        .map((f) => f.key)
      log.info('Required form fields not filled; will show form', {
        missing,
        inferredKeys: Object.keys(values),
      })
      return null
    }

    log.info('Form values inferred from user message via LLM; skipping form UI', {
      keys: Object.keys(values),
    })
    return values
  } catch (err) {
    log.warn('inferFormValuesFromUserMessage failed; will show form UI', { err })
    return null
  }
}
