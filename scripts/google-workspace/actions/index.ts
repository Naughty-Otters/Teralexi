/**
 * Google Workspace skill — Gmail, Calendar, Drive tools (skill-owned, not global toolSet).
 */
export {
  googleWorkspaceApi,
  googleWorkspaceAuthStatus,
  googleWorkspaceRequest,
  googleWorkspaceTools,
  googleGmailListMessages,
  googleGmailGetMessage,
  googleGmailSend,
  googleCalendarListCalendars,
  googleCalendarListEvents,
  googleCalendarCreateEvent,
  googleDriveListFiles,
  googleDriveGetFile,
  googleDriveDownload,
} from './google-workspace'

import { googleWorkspaceTools } from './google-workspace'

export const tools = googleWorkspaceTools

export default { tools }
