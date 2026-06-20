/**
 * Form module — schema parsing, HITL collect-form UI, and value inference.
 *
 * Import from this barrel only. Agent steps and flow should use {@link FormContext} via
 * {@link AgentFlowContext.form}, not this module directly.
 */

export type {
  CollectFormField,
  CollectFormSelectOption,
  FormFieldOptionsFromSpec,
  FormFieldOptionsParse,
  FormProjectionBindingSpec,
  ParsedCollectFormSchema,
  ResolvedCollectForm,
} from './schema'

export {
  normalizeSelectOptions,
  getSelectOptionValues,
  resolveSelectValue,
  isAllowedSelectValue,
  parseFormFieldsFromMarkdown,
  parseFormSchemaFromMarkdown,
  formValuesSatisfyRequired,
} from './schema'

export type { FormSchemaResolveContext } from './schema-resolve'
export {
  resolveFormFieldsFromMarkdown,
  resolveCollectFormFromMarkdown,
  extractBulletListFromMarkdown,
} from './schema-resolve'

export { FORM_PROJECTION_ARTIFACT_DEFAULT } from './form-projection'

export type {
  ClientUiMessage,
  CollectFormRequestData,
  CollectFormResponseData,
  CollectFormRequestPart,
  CollectFormResponsePart,
  CollectFormResponse,
} from './ui-messages'

export {
  isCollectFormRequestPart,
  isCollectFormResponsePart,
  convertCollectFormDataUIPartToText,
  formatCollectFormResponsePersistenceLine,
} from './ui-messages'

export {
  extractCollectFormResponse,
  uiMessagesIndicateFormCollectionResume,
  findCollectFormRequestMeta,
  applyCollectFormResponsesToUiMessages,
  formValuesProvidedByClientRequest,
} from './ui'

export { FormContext } from './context'
export type { FormFlowHost } from './context'
export { CollectFormDataStep } from './collect-data-step'
export type { TodoFormReadiness } from './todo-form-readiness'
export {
  assessTodoFormReadiness,
  READINESS_ASSESSMENT_FAILED,
} from './todo-form-readiness'
export {
  isUserFacingFormField,
  filterToUserFacingFormFields,
} from './form-user-field-policy'
export type { FormFieldKeyLabel } from './form-user-field-policy'
