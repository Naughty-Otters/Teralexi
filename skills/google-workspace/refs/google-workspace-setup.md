# Google Workspace setup (openfde)

openfde's **Google Workspace** skill uses the same OAuth account as **Settings → Google Account**. Tools call Gmail, Calendar, and Drive REST APIs with tokens stored under `~/.openfde/accounts/google-account.json`.

## Sign in

1. Open **Settings → Google Account → Sign in with Google**.
2. Approve the requested permissions (Gmail, Calendar, Drive, and Custom Search).
3. If you previously signed in before Workspace scopes were added: **Sign out**, then **Sign in** again.

No API keys, client IDs, or other configuration is required for normal use.

## Verify

Run an agent with the **Google Workspace** skill and ask it to call `google_workspace_auth_status`. You should see your email and a list of granted scopes.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `403` / insufficient scopes | Sign out and sign in again in Settings → Google Account |
| `Not signed in with Google` | Use Settings → Google Account |
| Gmail send fails | Confirm `gmail.compose` scope; sign out and sign in again; check recipient address |
| Drive download empty | For Google Docs, pass `exportMimeType` (e.g. `application/pdf`) |

## Advanced: custom OAuth client

Optional — only if you need your own Google Cloud project:

1. Create a **Desktop** OAuth client in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable Gmail, Calendar, and Drive APIs.
3. Add redirect URI: `http://127.0.0.1:7779`
4. Set in `~/.openfde/config/config.properties`:

```properties
app.google.clientId=YOUR_CLIENT_ID.apps.googleusercontent.com
app.google.clientSecret=YOUR_SECRET
```

## Security

- Tokens live only on the user's machine under `~/.openfde/accounts/`.
- Agents cannot read config secrets via tools; only API calls using the stored account.
- Write tools (send mail, create event, download to sandbox) require **user approval** in the UI.
