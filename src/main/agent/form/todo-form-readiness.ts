/**
 * Execution-time assessment: whether a todo has enough structured input to run tools,
 * or should enter the HITL form collection pipeline.
 */
import { Output } from '@teralexi-ai'
import type { StreamTextParams } from '../llm/runtime'
import { z } from 'zod'
import type { AgentStepContext } from '../context'
import type { ReferenceDoc, TodoItem } from '../types'
import { createLogger } from '@main/logger'
import { resolveFormDocName } from './collect-data-step'

const log = createLogger('form.todo-readiness')

const MAX_USER_MESSAGE_CHARS = 8000
const MAX_PRIOR_FORMS_CHARS = 4000

export type TodoFormReadiness = {
  /** True when the todo can run tools without structured form input. */
  sufficient: boolean
  /** True when structured input should be collected (form pipeline). */
  collectViaForm: boolean
  reason?: string
}

const readinessOutputSpec = (Output.object as any)({
  schema: z.object({
    sufficient: z
      .boolean()
      .describe(
        'True when this todo has enough concrete inputs to execute without collecting more structured fields via a form.',
      ),
    collectViaForm: z
      .boolean()
      .describe(
        'True when missing structured inputs should be collected via the form UI before tool execution.',
      ),
    reason: z
      .string()
      .describe('Brief explanation of the decision; empty string if obvious'),
  }),
}) as any

function formatPriorCollectedForms(
  collectedFormByTodoId: Record<number, Record<string, unknown>>,
  currentTodoId: number,
): string {
  const lines: string[] = []
  for (const [idStr, values] of Object.entries(collectedFormByTodoId)) {
    const id = Number(idStr)
    if (!Number.isFinite(id) || id >= currentTodoId) continue
    if (!values || Object.keys(values).length === 0) continue
    lines.push(`Todo #${id}: ${JSON.stringify(values)}`)
  }
  if (lines.length === 0) return '(none)'
  const joined = lines.join('\n')
  return joined.length > MAX_PRIOR_FORMS_CHARS
    ? `${joined.slice(0, MAX_PRIOR_FORMS_CHARS)}\n…`
    : joined
}

function buildReadinessUserContent(params: {
  todoItem: TodoItem
  reference_doc: ReferenceDoc[]
  skillId?: string
  userMessage: string
  collectedFormByTodoId: Record<number, Record<string, unknown>>
  references: AgentStepContext['references']
}): string {
  const {
    todoItem,
    reference_doc,
    skillId,
    userMessage,
    collectedFormByTodoId,
    references,
  } = params

  const formNameHint = todoItem.form_doc_name?.trim()
  const inferredFormName = resolveFormDocName(
    references,
    todoItem,
    reference_doc,
    skillId,
  )
  const formDocLine = formNameHint
    ? `form_doc_name hint: ${formNameHint}`
    : inferredFormName
      ? `Inferred form document: ${inferredFormName}`
      : 'No form document hint on this todo.'

  const trimmedUser = userMessage.trim()
  const userBlock =
    trimmedUser.length > MAX_USER_MESSAGE_CHARS
      ? `${trimmedUser.slice(0, MAX_USER_MESSAGE_CHARS)}\n…`
      : trimmedUser || '(empty)'

  return [
    `Task id: ${todoItem.id}`,
    `Task name: ${todoItem.name}`,
    `Task description: ${todoItem.description}`,
    `Success criteria: ${todoItem.success_criteria}`,
    formDocLine,
    '',
    'Prior collected form values (from earlier todos in this run):',
    formatPriorCollectedForms(collectedFormByTodoId, todoItem.id),
    '',
    'Latest user message:',
    userBlock,
  ].join('\n')
}

function normalizeReadinessOutput(parsed: {
  sufficient?: boolean
  collectViaForm?: boolean
  reason?: string
}): TodoFormReadiness {
  const sufficient = parsed.sufficient === true
  let collectViaForm = parsed.collectViaForm === true
  if (sufficient) {
    collectViaForm = false
  } else if (!collectViaForm && parsed.collectViaForm !== false) {
    collectViaForm = true
  }
  const reason = parsed.reason?.trim()
  return {
    sufficient,
    collectViaForm,
    ...(reason ? { reason } : {}),
  }
}

export const READINESS_ASSESSMENT_FAILED: TodoFormReadiness = {
  sufficient: false,
  collectViaForm: true,
  reason: 'readiness assessment failed',
}

/**
 * Decide whether this todo can proceed to tool execution or needs form collection.
 */
export async function assessTodoFormReadiness(
  ctx: AgentStepContext,
  params: {
    todoItem: TodoItem
    reference_doc: ReferenceDoc[]
  },
): Promise<TodoFormReadiness> {
  const { todoItem, reference_doc } = params

  const userContent = buildReadinessUserContent({
    todoItem,
    reference_doc,
    skillId: ctx.opts.skillId,
    userMessage: ctx.getLatestUserMessageContent?.() ?? '',
    collectedFormByTodoId: ctx.collectedFormByTodoId ?? {},
    references: ctx.references,
  })

  log.debug('assessing todo form readiness', {
    todoId: todoItem.id,
    name: todoItem.name,
  })

  try {
    const { output: parsed } = await ctx.providers.streamObjectToStepProgress<{
      sufficient?: boolean
      collectViaForm?: boolean
      reason?: string
    }>(ctx, {
      instructions: ctx.config.withResponseLanguageInstruction(
        `You assess whether an agent todo step has enough **user-facing** information to execute without a form.

User-facing inputs: document type, file paths the user must provide, titles, preferences, data the user owns.
NOT user-facing (never require a form for these): how to verify the step, success criteria, execution mode, fallback/retry, agent context, or confirmation to run tools.

Rules:
- Set sufficient: true when the user message and prior form values already supply the user-facing inputs this step needs.
- Set collectViaForm: true only when user-facing structured inputs are still missing (e.g. unknown file path, doc type, or required choice).
- Do NOT set collectViaForm because the todo mentions verification, validation, or execution planning — the agent handles those.
- When sufficient is true, collectViaForm must be false.
- Prefer sufficient: true when the user clearly stated what they want; do not require a form for confirmation alone.
- A form_doc_name hint means a form schema may exist if user-facing collection is needed.
- Output one JSON object matching the schema.`,
        ctx.opts.responseLanguage,
      ),
      messages: [{ role: 'user', content: userContent }],
      output: readinessOutputSpec,
      abortSignal: ctx.opts.abortSignal,
    } as StreamTextParams)

    const readiness = normalizeReadinessOutput(parsed ?? {})
    log.info('Todo form readiness assessed', {
      todoId: todoItem.id,
      sufficient: readiness.sufficient,
      collectViaForm: readiness.collectViaForm,
      reason: readiness.reason,
    })
    return readiness
  } catch (err) {
    log.warn('assessTodoFormReadiness failed; fail closed into form path', {
      todoId: todoItem.id,
      err,
    })
    return READINESS_ASSESSMENT_FAILED
  }
}
