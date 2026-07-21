# Support report upload API

Teralexi uploads diagnostic bundles to your platform backend when `BASE_API` is configured.

## Configuration

Set the platform base URL once in your env file:

```properties
# env/.dev.env, env/.sit.env, or env/.prod.env
BASE_API = 'https://api.example.com'
```

This maps to `app.base.apiUrl` at runtime. Default endpoints (relative to `BASE_API`):

| Service | Default path |
| --- | --- |
| GraphQL metrics | `/graphql` |
| Google sign-in | `/auth/login` |
| Support upload | `/support/upload` |

Optional overrides in `~/.teralexi/config/config.properties` or env files:

```properties
app.metrics.graphqlUrl=graphql
app.teralexi.googleAuthLoginUrl=auth/login
app.support.uploadUrl=support/upload
```

Values may be relative paths (joined with `BASE_API`) or legacy absolute URLs.

Upload requires the user to be signed in so the app can attach a platform
`access_token` (`Authorization: Bearer …`). Sessions renew via
`refresh_token` (`POST /api/v1/auth/refresh`); see
[SUBSCRIPTION-INTEGRATION.md](./SUBSCRIPTION-INTEGRATION.md).

Upload is also gated by the verified entitlement feature `support.upload`.

## Request

`POST {BASE_API}/support/upload`  
`Content-Type: multipart/form-data`  
`Authorization: Bearer <server-access-token>`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `location` | string | yes | Storage key for the upload (report UUID; `[A-Za-z0-9._-]` only) |
| `file` | file | yes | Zip archive (`application/zip`) |
| `reportId` | string | no | Same UUID sent in `location` |
| `comments` | string | no | User description of the problem |
| `appVersion` | string | no | teralexi semver (e.g. `0.0.1`) |
| `manifest` | string | no | JSON `SupportBundleManifest` |

## Response

- **2xx** — accepted
- **4xx/5xx** — shown to the user as an upload error

## Bundle contents

- `manifest.json`, `user-comment.txt`, `errors.jsonl`, `system.json`
- `settings/` — redacted config, user properties, MCP, agents
- `conversations/<id>.json` — current conversation when available
- `memory/` — session + blocks when enabled
- `logs/main.log.tail`, `logs/agents/*.log`
- `sandbox/` — optional, size-capped

Channel auth under `~/.teralexi/channels/` is never included.

## Suggested server flow

1. Validate JWT
2. Receive multipart upload
3. Validate size
4. Store the zip privately (object storage, ticket attachment, etc.)
5. Return `{ "ok": true, "reportId": "…" }`

## Local export

**Export bundle** saves to:

`~/.teralexi/logs/support-bundles/teralexi-support-<reportId>.zip`

## Client upload policy

Before POSTing to `/support/upload`, the desktop app:

1. **Upload cooldown** — default **10 minutes** between uploads per signed-in user (`app.support.uploadCooldownMinutes` in `config.properties`).
2. **Daily quota** — default **5 uploads per calendar day** per signed-in user (`app.support.maxUploadsPerDay`). Tracked in `~/.teralexi/logs/support-upload-tracker.json`.

Export-only (**Export bundle**) is not rate-limited.
