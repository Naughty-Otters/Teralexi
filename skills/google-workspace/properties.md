name: Google Workspace
description: Gmail, Calendar, and Drive via Google APIs. Use when the user mentions email, calendar, Drive, Google Workspace, or scheduling.
model: gemma4
provider: ollama
color: warning
enabled: true
allowed_tools: google_workspace_auth_status, google_gmail_list_messages, google_gmail_get_message, google_gmail_send, google_calendar_list_calendars, google_calendar_list_events, google_calendar_create_event, google_drive_list_files, google_drive_get_file, google_drive_download, google_workspace_api
system_properties: app.google.clientId, app.google.clientSecret
system_property.app.google.clientId.label: Google OAuth client ID
system_property.app.google.clientId.description: Desktop OAuth client ID from Google Cloud Console (required for Google Workspace).
system_property.app.google.clientId.type: string
system_property.app.google.clientId.placeholder: ….apps.googleusercontent.com
system_property.app.google.clientSecret.label: Google OAuth client secret
system_property.app.google.clientSecret.description: Matching client secret from Google Cloud Console.
system_property.app.google.clientSecret.type: secret
system_property.app.google.clientSecret.placeholder: Client secret
