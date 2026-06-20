name: Google Workspace
description: Gmail, Calendar, and Drive via Google APIs. Use when the user mentions email, calendar, Drive, Google Workspace, or scheduling.
model: gemma4
provider: ollama
color: warning
enabled: true
allowed_tools: google_workspace_auth_status, google_gmail_list_messages, google_gmail_get_message, google_gmail_send, google_calendar_list_calendars, google_calendar_list_events, google_calendar_create_event, google_drive_list_files, google_drive_get_file, google_drive_download, google_workspace_api