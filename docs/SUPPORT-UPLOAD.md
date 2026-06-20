# Support report upload API

openfde can POST diagnostic bundles to a server you operate. Configure the endpoint in:

```properties
# ~/.openfde/config/config.properties
app.support.uploadUrl=https://your-server.example.com/api/support/reports
app.support.maxMegabytes=100
```

When the user clicks **Submit report** in Settings → About, the app:

1. Builds a zip with logs, redacted settings, memory, optional sandbox, and current conversation
2. POSTs `multipart/form-data` to `app.support.uploadUrl`

## Request

`POST /api/support/reports`  
`Content-Type: multipart/form-data`

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

1. Receive multipart upload
2. Validate size
3. Store zip privately or attach via GitHub App to a private repo/issue
4. Return `{ "ok": true, "reportId": "…" }`

## Local export

**Export bundle** saves to:

`~/.openfde/logs/support-bundles/openfde-support-<reportId>.zip`
