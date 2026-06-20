import { createLogger, traceFunction } from '@main/logger'
import { parseClientUiMessages } from '../utils/client-ui-parse'
import type { ClientUiMessage, CollectFormResponse } from './ui-messages'
import {
  applyCollectFormResponsesToUiMessages as applyCollectFormResponsesToUiMessagesImpl,
  extractCollectFormResponse as extractCollectFormResponseImpl,
  findCollectFormRequestMeta as findCollectFormRequestMetaImpl,
  formValuesProvidedByClientRequest as formValuesProvidedByClientRequestImpl,
  uiMessagesIndicateFormCollectionResume as uiMessagesIndicateFormCollectionResumeImpl,
} from './ui-messages'

const log = createLogger('form.ui')

export type { CollectFormResponse, ClientUiMessage }

function asClientUiMessages(
  uiMessages: ClientUiMessage[] | unknown[] | undefined,
): ClientUiMessage[] | undefined {
  if (!uiMessages?.length) return undefined
  if (
    uiMessages.length > 0 &&
    typeof uiMessages[0] === 'object' &&
    uiMessages[0] !== null &&
    (uiMessages[0] as ClientUiMessage).role !== undefined &&
    Array.isArray((uiMessages[0] as ClientUiMessage).parts)
  ) {
    return uiMessages as ClientUiMessage[]
  }
  return parseClientUiMessages(uiMessages)
}

export const extractCollectFormResponse = traceFunction(
  log,
  'extractCollectFormResponse',
  (uiMessages: ClientUiMessage[] | unknown[] | undefined) =>
    extractCollectFormResponseImpl(asClientUiMessages(uiMessages)),
)

export const uiMessagesIndicateFormCollectionResume = traceFunction(
  log,
  'uiMessagesIndicateFormCollectionResume',
  (uiMessages: ClientUiMessage[] | unknown[] | undefined) =>
    uiMessagesIndicateFormCollectionResumeImpl(asClientUiMessages(uiMessages)),
)

export const findCollectFormRequestMeta = traceFunction(
  log,
  'findCollectFormRequestMeta',
  (uiMessages: ClientUiMessage[] | unknown[] | undefined, requestId: string) =>
    findCollectFormRequestMetaImpl(asClientUiMessages(uiMessages), requestId),
)

export const applyCollectFormResponsesToUiMessages = traceFunction(
  log,
  'applyCollectFormResponsesToUiMessages',
  (
    collectedFormByTodoId: Record<number, Record<string, unknown>>,
    uiMessages: ClientUiMessage[] | unknown[] | undefined,
  ) =>
    applyCollectFormResponsesToUiMessagesImpl(
      collectedFormByTodoId,
      asClientUiMessages(uiMessages),
    ),
)

export const formValuesProvidedByClientRequest = traceFunction(
  log,
  'formValuesProvidedByClientRequest',
  (uiMessages: ClientUiMessage[] | unknown[] | undefined, todoId: number) =>
    formValuesProvidedByClientRequestImpl(asClientUiMessages(uiMessages), todoId),
)
