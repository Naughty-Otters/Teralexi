/**
 * Documents skill — TypeScript action tools.
 * Exported as `tools` array so skill-module-loader picks them up from
 * `actions/index.ts` via `collectToolsFromModule`.
 */
export { createSpreadsheet }  from './create-spreadsheet'
export { readSpreadsheet }    from './read-spreadsheet'
export { createPresentation } from './create-presentation'
export { createWordDoc }      from './create-word-doc'
export { renderDocument }     from './render-document'

import { createSpreadsheet }  from './create-spreadsheet'
import { readSpreadsheet }    from './read-spreadsheet'
import { createPresentation } from './create-presentation'
import { createWordDoc }      from './create-word-doc'
import { renderDocument }     from './render-document'

export const tools = [
  createSpreadsheet,
  readSpreadsheet,
  createPresentation,
  createWordDoc,
  renderDocument,
]
