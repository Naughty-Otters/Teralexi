# Support report upload API

OpenFDE uploads diagnostic bundles to your platform backend when `BASE_API` is configured.

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

Optional overrides in `~/.openfde/config/config.properties` or env files:

```properties
app.metrics.graphqlUrl=graphql
app.openfde.googleAuthLoginUrl=auth/login
app.support.uploadUrl=support/upload
```

Values may be relative paths (joined with `BASE_API`) or legacy absolute URLs.

Upload requires the user to be signed in with Google so the app can attach a server JWT (`Authorization: Bearer …`).

## Request

`POST {BASE_API}/support/upload`  
`Content-Type: multipart/form-data`  
`Authorization: Bearer <server-access-token>`

| Field | Type | Description |
|-------|------|-------------|
| `reportId` | string | UUID for this report |
| `comments` | string | User description of the problem |
| `appVersion` | string | openfde semver (e.g. `0.0.1`) |
| `manifest` | string | JSON `SupportBundleManifest` |
| `bundle` | file | Zip archive (`application/zip`) |

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

Channel auth under `~/.openfde/channels/` is never included.

## Suggested server flow

1. Validate JWT
2. Receive multipart upload
3. Validate size
4. Store zip privately or attach via GitHub App to a private repo/issue
5. Return `{ "ok": true, "reportId": "…" }`

## Local export

**Export bundle** saves to:

`~/.openfde/logs/support-bundles/openfde-support-<reportId>.zip`
