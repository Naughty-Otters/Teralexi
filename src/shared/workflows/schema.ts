import { z } from 'zod'

export const WORKFLOW_DEFINITION_VERSION = 1 as const

export const workflowStatusSchema = z.enum([
  'draft',
  'confirmed',
  'testing',
  'deployed',
])

export type WorkflowStatus = z.infer<typeof workflowStatusSchema>

export const workflowInputFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(['string', 'text', 'number', 'boolean', 'select']),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z
    .array(
      z.object({
        value: z.string(),
        label: z.string().optional(),
      }),
    )
    .optional(),
})

export type WorkflowInputField = z.infer<typeof workflowInputFieldSchema>

export const workflowTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({
    type: z.literal('schedule'),
    cron: z.string().min(1),
    timezone: z.string().optional(),
  }),
  z.object({
    type: z.literal('channel_message'),
    channelId: z.string().min(1),
    match: z.string().min(1),
  }),
  z.object({
    type: z.literal('channel_form'),
    formId: z.string().min(1),
    channelId: z.string().optional(),
  }),
  z.object({
    type: z.literal('webhook'),
    path: z.string().min(1),
  }),
])

export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>

export const dslExpressionSchema = z.object({
  system_msg: z.string().optional(),
  prompt: z.string().optional(),
  title: z.string().optional(),
  tool: z.string().optional(),
  else_tool: z.string().optional(),
  else_goto: z.string().optional(),
  precondition: z.string().optional(),
  when: z.string().optional(),
})

export const workflowTodoItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  verifyCommand: z.string().optional(),
})

export const workflowStepSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    type: z.literal('task'),
    title: z.string().optional(),
    tools: z.array(z.string()).optional(),
    expression: dslExpressionSchema.optional(),
    stage: z.string().optional(),
    precondition: z.string().optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('channel'),
    title: z.string().optional(),
    channelId: z.string().min(1),
    action: z.enum(['collect_form', 'send_notification']),
    form: z.string().optional(),
    template: z.string().optional(),
    target: z.string().optional(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('plan_foreach'),
    title: z.string().optional(),
    todosFrom: z.enum(['steps', 'inline']).optional(),
    todos: z.array(workflowTodoItemSchema).optional(),
    expression: dslExpressionSchema.optional(),
  }),
])

export type WorkflowStep = z.infer<typeof workflowStepSchema>

export const httpMockSchema = z.object({
  match: z.string().min(1),
  method: z.string().optional(),
  response: z.object({
    status: z.number().optional(),
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
})

export const toolMockSchema = z.object({
  tool: z.string().min(1),
  fixture: z.unknown().optional(),
  inputMatch: z.record(z.string(), z.unknown()).optional(),
})

export const workflowMocksSchema = z.object({
  http: z.array(httpMockSchema).optional(),
  tools: z.array(toolMockSchema).optional(),
})

export type WorkflowMocks = z.infer<typeof workflowMocksSchema>

export const workflowEntityFieldSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user_input'),
    formStepId: z.string().optional(),
    inputKey: z.string().optional(),
  }),
  z.object({
    kind: z.literal('tool'),
    tool: z.string().min(1),
    stepId: z.string().optional(),
    resultPath: z.string().optional(),
  }),
])

export type WorkflowEntityFieldSource = z.infer<
  typeof workflowEntityFieldSourceSchema
>

export const workflowEntityFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  type: z.enum([
    'string',
    'text',
    'number',
    'boolean',
    'date',
    'datetime',
    'email',
    'select',
    'reference',
  ]),
  required: z.boolean().optional(),
  description: z.string().optional(),
  source: workflowEntityFieldSourceSchema,
  options: z
    .array(
      z.object({
        value: z.string(),
        label: z.string().optional(),
      }),
    )
    .optional(),
})

export type WorkflowEntityField = z.infer<typeof workflowEntityFieldSchema>

export const workflowBusinessEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(workflowEntityFieldSchema).min(1),
})

export type WorkflowBusinessEntity = z.infer<typeof workflowBusinessEntitySchema>

export const workflowOutputSchema = z.object({
  key: z.string().min(1),
  from: z.string().min(1),
})

export const workflowExecutorSchema = z.object({
  agentId: z.string().min(1),
  model: z.string().optional(),
  provider: z.string().optional(),
})

export const workflowDefinitionSchema = z.object({
  version: z.literal(WORKFLOW_DEFINITION_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  status: workflowStatusSchema,
  executor: workflowExecutorSchema,
  inputs: z.array(workflowInputFieldSchema).optional(),
  entities: z.array(workflowBusinessEntitySchema).optional(),
  triggers: z.array(workflowTriggerSchema).optional(),
  steps: z.array(workflowStepSchema).min(1),
  mocks: workflowMocksSchema.optional(),
  outputs: z.array(workflowOutputSchema).optional(),
  conditionals: z
    .array(
      z.object({
        afterStepId: z.string().min(1),
        when: z.string().min(1),
        thenStepIds: z.array(z.string().min(1)),
        elseStepIds: z.array(z.string().min(1)).optional(),
      }),
    )
    .optional(),
})

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>

export const workflowCompileResultSchema = z.object({
  definition: workflowDefinitionSchema,
  mermaid: z.string(),
  summaryMarkdown: z.string(),
  validationErrors: z.array(z.string()),
  validationWarnings: z.array(z.string()),
})

export type WorkflowCompileResult = z.infer<typeof workflowCompileResultSchema>

export function parseWorkflowDefinition(raw: unknown): WorkflowDefinition {
  return workflowDefinitionSchema.parse(raw)
}

export function safeParseWorkflowDefinition(
  raw: unknown,
):
  | { success: true; data: WorkflowDefinition }
  | { success: false; error: string } {
  const result = workflowDefinitionSchema.safeParse(raw)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error.message }
}
