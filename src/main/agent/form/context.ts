import type { AgentStepContext } from '../context'
import type { ClientUiMessage } from '../utils/client-ui-parse'
import type { ReferenceContext } from '../resources/context'
import type { ReferenceDoc, TodoItem } from '../types'
import {
  findFormReferenceDoc,
  referenceDocIsCollectFormSchemaDoc,
  resolveFormDocName,
} from './collect-data-step'
import type { TodoFormReadiness } from './todo-form-readiness'
import {
  applyCollectFormResponsesToUiMessages,
  extractCollectFormResponse,
  findCollectFormRequestMeta,
  formValuesProvidedByClientRequest,
  uiMessagesIndicateFormCollectionResume,
} from './ui'
import { convertCollectFormDataUIPartToText } from './ui-messages'

export type FormFlowHost = {
  readonly references: ReferenceContext
  readonly collectedFormByTodoId: Record<number, Record<string, unknown>>
  readonly clientUiMessages?: ClientUiMessage[] | unknown[]
  readonly skillId?: string
}

/**
 * Form collection surface for agent flow/step clients.
 * Obtain via {@link AgentFlowContext.form} / {@link AgentStepContext.form}.
 */
export class FormContext {
  constructor(private readonly host: FormFlowHost) {}

  extractCollectFormResponse(
    uiMessages: ClientUiMessage[] | unknown[] | undefined = this.host
      .clientUiMessages,
  ) {
    return extractCollectFormResponse(uiMessages)
  }

  uiMessagesIndicateFormCollectionResume(
    uiMessages: ClientUiMessage[] | unknown[] | undefined = this.host
      .clientUiMessages,
  ) {
    return uiMessagesIndicateFormCollectionResume(uiMessages)
  }

  findCollectFormRequestMeta(
    requestId: string,
    uiMessages: ClientUiMessage[] | unknown[] | undefined = this.host
      .clientUiMessages,
  ) {
    return findCollectFormRequestMeta(uiMessages, requestId)
  }

  applyCollectFormResponsesToUiMessages(
    uiMessages: ClientUiMessage[] | unknown[] | undefined = this.host
      .clientUiMessages,
  ) {
    return applyCollectFormResponsesToUiMessages(
      this.host.collectedFormByTodoId,
      uiMessages,
    )
  }

  formValuesProvidedByClientRequest(
    todoId: number,
    uiMessages: ClientUiMessage[] | unknown[] | undefined = this.host
      .clientUiMessages,
  ) {
    return formValuesProvidedByClientRequest(uiMessages, todoId)
  }

  convertCollectFormDataUIPartToText(part: { type?: string; data?: unknown }) {
    return convertCollectFormDataUIPartToText(part)
  }

  referenceDocIsCollectFormSchemaDoc(doc: ReferenceDoc, todoItem: TodoItem) {
    return referenceDocIsCollectFormSchemaDoc(
      this.host.references,
      doc,
      todoItem,
      this.host.skillId,
    )
  }

  resolveFormDocName(todoItem: TodoItem, reference_doc: ReferenceDoc[]) {
    return resolveFormDocName(
      this.host.references,
      todoItem,
      reference_doc,
      this.host.skillId,
    )
  }

  findFormReferenceDoc(reference_doc: ReferenceDoc[], formName: string) {
    return findFormReferenceDoc(this.host.references, reference_doc, formName)
  }

  async maybePauseForFormBeforeTodoExecution(
    stepCtx: AgentStepContext,
    params: {
      todoItem: TodoItem
      reference_doc: ReferenceDoc[]
      todoIndexInPlan: number
      readiness: TodoFormReadiness
    },
  ): Promise<boolean> {
    const { CollectFormDataStep } = await import('./collect-data-step')
    return new CollectFormDataStep(stepCtx).maybePauseForFormBeforeTodoExecution(
      params,
    )
  }
}
