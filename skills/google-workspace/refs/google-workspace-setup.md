# Google Workspace setup (openfde)

The **Google Workspace** skill calls Gmail, Calendar, and Drive via Google OAuth. Tokens are stored locally at `~/.openfde/accounts/google-workspace-account.json`.

Before first use you must configure a **Google Cloud OAuth app** and sign in. Credential keys are declared in this skill’s `properties.md` and saved to `~/.openfde/config/config.properties`:

| Property | Purpose |
|----------|---------|
| `app.google.clientId` | Desktop OAuth 2.0 client ID |
| `app.google.clientSecret` | Matching client secret |

These are the single source of truth — the chat setup form and agent settings read and write the same keys.

## 1. Create a Google Cloud OAuth app

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable **Gmail**, **Google Calendar**, and **Google Drive** APIs.
3. Create an OAuth client of type **Desktop app**.
4. Add authorized redirect URI: `http://127.0.0.1:7779`

## 2. Enter credentials in openfde

Use either path (both persist to the same `config.properties` keys):

**Agent settings (recommended)**

1. Open **Settings → Agents → Google Workspace → Configurations**.
2. Enter **OAuth client ID** and **OAuth client secret**.
3. Click away from each field to save (or use the chat setup form on first run — same values).

**Chat (first time only)**

1. Select the **Google Workspace** agent.
2. If credentials are missing, a setup form appears above the composer.
3. Fill in the fields and click **Save and continue**. This is not saved as chat history.

**Manual edit**

```properties
# ~/.openfde/config/config.properties
app.google.clientId=YOUR_CLIENT_ID.apps.googleusercontent.com
app.google.clientSecret=YOUR_CLIENT_SECRET
```

## 3. Sign in with Google Workspace

1. In **Settings → Agents → Google Workspace → Configurations**, scroll to **Google account**.
2. Click **Sign in with Google Workspace** and approve Gmail, Calendar, and Drive access.
3. If you previously signed in before Workspace scopes were added: **Sign out**, then sign in again.

## Verify

Run an agent with the **Google Workspace** skill and ask it to call `google_workspace_auth_status`. You should see your email and a list of granted scopes.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Setup form or Configurations keeps appearing | Fill both `app.google.clientId` and `app.google.clientSecret` |
| Sign-in button disabled | Enter OAuth client ID and secret in Configurations first |
| `403` / insufficient scopes | Sign out and sign in again under Configurations |
| `Not signed in with Google` | Complete sign-in in **Settings → Agents → Google Workspace → Configurations** |
| Gmail send fails | Confirm `gmail.compose` scope; sign out and sign in again; check recipient address |
| Drive download empty | For Google Docs, pass `exportMimeType` (e.g. `application/pdf`) |

## Skill properties (developers)

Required config keys and form labels live in `skills/google-workspace/properties.md`:

```markdown
system_properties: app.google.clientId, app.google.clientSecret
system_property.app.google.clientId.label: Google OAuth client ID
system_property.app.google.clientSecret.type: secret
```

After editing bundled skills, regenerate the manifest: `npx tsx .electron-vite/generate-bundled-skills.ts`

## Security

- OAuth client secrets and tokens stay on the user’s machine (`config.properties` and `~/.openfde/accounts/`).
- Agents cannot read config secrets via tools; only API calls using the stored account.
- Write tools (send mail, create event, download to sandbox) require **user approval** in the UI.
