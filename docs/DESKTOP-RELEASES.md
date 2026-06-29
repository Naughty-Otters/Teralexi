# Desktop releases (S3 + public update feed)

Production desktop updates use a **private S3 bucket** for CI uploads and a **public HTTP feed** on your platform API (`BASE_API`). The GitHub repository stays private; end users never receive publish credentials. **Updates do not require sign-in** (unlike support upload).

## Architecture

```
GitHub Actions (Release workflow)
  Signed build (macOS + Windows) + AWS credentials (GitHub secrets)
       │
       ▼
  s3://<bucket>/desktop/releases/stable/
       ├── latest-mac.yml
       ├── latest.yml
       └── installers + blockmaps…

Installed OpenFDE app (no auth)
  GET {BASE_API}/desktop/releases/stable/latest-mac.yml   (macOS)
  GET {BASE_API}/desktop/releases/stable/latest.yml       (Windows)
  GET {BASE_API}/desktop/releases/stable/<installer>
       │
       ▼
  Your API or CDN serves objects from S3 (public read on this prefix)
```

---

## Environment files

Build and runtime config is loaded from `env/` (bundled into the app) and optionally overridden by `~/.openfde/config/.env` (never commit secrets there to git — keep signing certs/passwords in that file locally or in GitHub secrets only).

| File | `OPENFDE_BUILD_ENV` | Used by | Purpose |
| --- | --- | --- | --- |
| `env/.dev.env` | `dev` | `npm run dev` | Local development |
| `env/.sit.env` | `sit` | CI workflow, `npm run build:*:sit` | Staging / internal QA |
| `env/.prod.env` | `prod` | Release workflow, `npm run build:*`, `npm run release:*` | Production releases |

Process env and `~/.openfde/config/.env` override bundled env files. See [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md) for build modes.

---

## Client configuration (runtime)

These settings control where **installed** apps check for updates.

### `BASE_API` (required)

Maps to `app.base.apiUrl` at runtime.

| Environment | Example in repo |
| --- | --- |
| Development | `BASE_API = 'http://localhost:8000'` in `env/.dev.env` |
| Staging | `BASE_API = 'https://stage_api.openfde.dev/'` in `env/.sit.env` |
| Production | `BASE_API = 'https://api.openfde.dev/'` in `env/.prod.env` |

**Update feed URL** (default, no override):

```
{BASE_API}/desktop/releases/stable/
```

**Feed files checked by the app:**

| Platform | URL |
| --- | --- |
| macOS | `{BASE_API}/desktop/releases/stable/latest-mac.yml` |
| Windows | `{BASE_API}/desktop/releases/stable/latest.yml` |
| Linux | `{BASE_API}/desktop/releases/stable/latest-linux.yml` |

The app calls `autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })` with **no** `Authorization` header.

### Optional: custom release channel path

Override the feed path (relative to `BASE_API` or absolute URL) in `env/*.env` or user `config.properties`:

```properties
app.desktop.releasesUrl=desktop/releases/stable
```

**Staging vs production:** use the same default path (`desktop/releases/stable/`). The only difference between `env/.sit.env` and `env/.prod.env` is **`BASE_API`** — staging apps check `https://stage_api.openfde.dev/desktop/releases/stable/`, production apps check `https://api.openfde.dev/desktop/releases/stable/`. Do not set a separate `app.desktop.releasesUrl` for sit.

### User override file

`~/.openfde/config/.env` wins over bundled env files. Example:

```properties
BASE_API = 'http://localhost:8000'
```

---

## Local dev update testing (`npm run dev`)

`electron-updater` is **disabled** in unpackaged dev unless you opt in explicitly.

```properties
# env/.dev.env
DESKTOP_UPDATE_FORCE_DEV = 'true'
```

| Setting | Maps to | Notes |
| --- | --- | --- |
| `DESKTOP_UPDATE_FORCE_DEV` | `app.desktop.forceDevUpdateConfig` | Env-only; not written to user `config.properties` |
| `APP_DESKTOP_FORCEDEVUPDATECONFIG` | same | Alternative name |
| `OPENFDE_APP_DESKTOP_FORCEDEVUPDATECONFIG` | same | Alternative name |

When enabled:

1. Update checks run against whatever feed `BASE_API` resolves to (any host — not limited to localhost).
2. The app writes `~/.openfde/config/dev-app-update.yml` (feed URL + cache dir) so **download** works — no `dev-app-update.yml` in the repo root is needed.
3. **Install** (`Restart and install`) still requires a **signed + notarized** macOS build; unsigned local zips fail Gatekeeper/ShipIt validation.

Packaged installs **ignore** `DESKTOP_UPDATE_FORCE_DEV` — updates always run when `BASE_API` is set.

### Local feed stub

Serve YAML + zip from your local API, e.g.:

```
GET http://localhost:8000/desktop/releases/stable/latest-mac.yml
GET http://localhost:8000/desktop/releases/stable/OpenFDE-0.0.2-arm64-mac.zip
```

Restart the dev app after changing env files.

---

## Build-time configuration (code signing)

Installers must be **signed** for production auto-update install (especially macOS ShipIt / Gatekeeper). Signing is configured at **build time**, not in the running app.

Configure in **`~/.openfde/config/.env`** locally or **GitHub Actions secrets** in CI/Release workflows. Full guide: **[CODE-SIGNING.md](./CODE-SIGNING.md)**.

### Summary — local (`~/.openfde/config/.env`)

**macOS**

```properties
MAC_SIGN_IDENTITY = 'Developer ID Application: Your Name (TEAMID)'
# or
MAC_SIGN_CERTIFICATE = '~/certs/openfde.p12'
MAC_SIGN_CERTIFICATE_PASSWORD = 'your-p12-password'

# Notarization (required for in-app install on macOS)
MAC_APPLE_ID = 'you@example.com'
MAC_APPLE_APP_SPECIFIC_PASSWORD = 'xxxx-xxxx-xxxx-xxxx'
MAC_APPLE_TEAM_ID = 'TEAMID'
```

**Windows**

```properties
WIN_SIGN_CERTIFICATE = '~/certs/openfde.pfx'
WIN_SIGN_CERTIFICATE_PASSWORD = 'your-pfx-password'
```

All `npm run build:*` and `npm run release:*` scripts use `scripts/run-electron-builder.ts`, which loads these vars before invoking electron-builder.

---

## GitHub Actions

Two workflows: **CI** (staging) and **Release** (production). Both sign macOS and Windows builds when signing secrets are configured.

```
Pull request / push to branch
       │
       ▼
  CI workflow (OPENFDE_BUILD_ENV=sit → env/.sit.env)
       ├── unit tests
       ├── build:mac:sit  (macOS, signed)
       ├── build:win64:sit (Windows, signed)
       └── artifacts (signed sit builds)

Actions → Release → confirm "release"
       │
       ▼
  Release workflow (OPENFDE_BUILD_ENV=prod → env/.prod.env)
       ├── verify version
       ├── unit tests
       ├── release:mac (macOS, signed + notarized)
       ├── release:win (Windows, signed)
       └── S3 stable/ production feed
```

### CI workflow — staging

**File:** `.github/workflows/ci.yml`

| Trigger | Behavior |
| --- | --- |
| **Pull request** | Unit tests + signed **sit** macOS/Windows builds → GitHub artifacts |
| **Push** (any branch) | Same as PR |
| **Push** to `main` | Same as PR + README CI status update |
| **Manual** | Actions → **CI** → Run workflow |

| Setting | Value |
| --- | --- |
| Build env | `OPENFDE_BUILD_ENV=sit` → `env/.sit.env` |
| Staging API | `BASE_API` in `.sit.env` (e.g. `https://stage_api.openfde.dev/`) |
| Update feed | Same path as prod: `{BASE_API}/desktop/releases/stable/` (no path override in `.sit.env`) |
| macOS script | `npm run build:mac:sit` |
| Windows script | `npm run build:win64:sit` |
| S3 | CI does **not** upload; artifacts only. Publish to staging S3 separately if needed (same prefix on staging infra). |
| Signing | `MAC_SIGN_*` on macOS runner; `WIN_SIGN_*` on Windows runner |

### Release workflow — production

**File:** `.github/workflows/release.yml`  
**Trigger:** Actions → **Release** → Run workflow → type `release` to confirm

| Setting | Value |
| --- | --- |
| Build env | `OPENFDE_BUILD_ENV=prod` → `env/.prod.env` |
| Production API | `BASE_API` in `.prod.env` (e.g. `https://api.openfde.dev/`) |
| Update feed path | default `{BASE_API}/desktop/releases/stable/` |
| macOS script | `npm run release:mac` |
| Windows script | `npm run release:win` |
| S3 prefix | `desktop/releases/stable/` |
| Signing | `MAC_SIGN_*` + Apple notarization on macOS; `WIN_SIGN_*` on Windows |

Each runner receives **only its platform’s signing secrets** (macOS job never gets the Windows `.pfx`, and vice versa).

---

## GitHub Actions secrets

Configure in repository **Settings → Secrets and variables → Actions**.

### S3 publish (Release workflow only)

| Secret | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | S3 upload (`PutObject` on `desktop/releases/*`) |
| `AWS_SECRET_ACCESS_KEY` | S3 upload |
| `AWS_REGION` | Bucket region |
| `S3_RELEASE_BUCKET` | Bucket name |

| Workflow | S3 prefix |
| --- | --- |
| **CI** | None (GitHub artifacts only) |
| **Release** | `desktop/releases/stable/` |

### macOS code signing + notarization

Used by **Release** (macOS job) and **CI** (macOS job). Injected as `MAC_SIGN_*` env vars at build time.

| Secret | Build env var | Purpose |
| --- | --- | --- |
| `MAC_SIGN_CERTIFICATE_BASE64` | `MAC_SIGN_CERTIFICATE` | Base64-encoded `.p12` |
| `MAC_SIGN_CERTIFICATE_PASSWORD` | `MAC_SIGN_CERTIFICATE_PASSWORD` | `.p12` password |
| `MAC_SIGN_IDENTITY` | `MAC_SIGN_IDENTITY` | e.g. `Developer ID Application: … (TEAMID)` |
| `APPLE_ID` | `MAC_APPLE_ID` | Notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | `MAC_APPLE_APP_SPECIFIC_PASSWORD` | Notarization |
| `APPLE_TEAM_ID` | `MAC_APPLE_TEAM_ID` | Notarization |

Encode certificate:

```bash
base64 -i openfde.p12 | pbcopy
```

### Windows code signing (Authenticode)

Used by **Release** (Windows job) and **CI** (Windows job).

| Secret | Build env var | Purpose |
| --- | --- | --- |
| `WIN_SIGN_CERTIFICATE_BASE64` | `WIN_SIGN_CERTIFICATE` | Base64-encoded `.pfx` |
| `WIN_SIGN_CERTIFICATE_PASSWORD` | `WIN_SIGN_CERTIFICATE_PASSWORD` | `.pfx` password |

Encode certificate:

```bash
# macOS / Linux
base64 -i openfde.pfx | pbcopy

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('openfde.pfx')) | Set-Clipboard
```

If signing secrets are missing, workflows still produce **unsigned** installers (fine for internal testing; not for public auto-update install on macOS).

---

## S3 layout

| Key | Purpose |
| --- | --- |
| `desktop/releases/stable/latest.yml` | Windows feed (`electron-updater`) |
| `desktop/releases/stable/latest-mac.yml` | macOS feed |
| `desktop/releases/stable/latest-linux.yml` | Linux feed (when built) |
| `desktop/releases/stable/*.{exe,zip,dmg,blockmap}` | Installers referenced by feed |

The `desktop/releases/stable/` prefix must be **publicly readable** (CloudFront, API static proxy, or bucket policy on that prefix only). Keep the rest of the bucket private.

Staging and production use the **same key layout** under their respective API hosts (`stage_api.openfde.dev` vs `api.openfde.dev`). CI does not publish to S3; upload staging builds to your staging bucket/API separately when you need a live staging update feed.

---

## Build and publish commands

### Local production build + S3 upload

```bash
export OPENFDE_BUILD_ENV=prod
# Signing: set MAC_SIGN_* / WIN_SIGN_* in ~/.openfde/config/.env
# S3:
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
export S3_RELEASE_BUCKET=your-bucket

npm run release:mac      # on macOS
npm run release:win      # on Windows
npm run release:upload-s3
```

### Via GitHub

1. Bump version in `package.json` and `CHANGELOG.md`, push.
2. Actions → **Release** → Run workflow → type `release`.
3. Verify S3 keys: `latest-mac.yml`, `latest.yml`, installers.

See [RELEASE.md](./RELEASE.md) for the full release checklist.

---

## Client update behavior

| When | Action |
| --- | --- |
| 30s after launch | Silent check (packaged app with `BASE_API` set) |
| Every 6 hours | Background re-check |
| Settings → About | Manual “Check for updates” |
| Update available | User clicks “Download update” |
| Download complete | User clicks “Restart and install” |

Title bar shows an update indicator when a new version is available (Settings → About).

Dev / unpackaged runs skip checks unless `DESKTOP_UPDATE_FORCE_DEV=true`.

---

## Server API contract

Expose anonymous `GET` for the release prefix. Typical options:

1. **Reverse proxy / static route** — nginx or your API serves `GET /desktop/releases/stable/*` from S3 or CloudFront.
2. **CloudFront** — origin = S3 prefix; URL = `{BASE_API}/desktop/releases/stable/`.

### Feed metadata

```
GET /desktop/releases/stable/latest-mac.yml
GET /desktop/releases/stable/latest.yml
GET /desktop/releases/stable/latest-linux.yml
```

Return YAML with `Content-Type: application/x-yaml`.

Example feed (generated by electron-builder — do not hand-edit):

```yaml
version: 0.0.2
files:
  - url: OpenFDE-0.0.2-mac.zip
    sha512: <base64-sha512>
    size: 198765432
path: OpenFDE-0.0.2-mac.zip
sha512: <base64-sha512>
releaseDate: '2026-06-28T10:00:00.000Z'
```

`sha512` and `size` are required — empty values cause `electron-updater` to fail.

Local test stub:

```yaml
version: 0.0.2-test
files:
  - url: OpenFDE-0.0.2-test-mac.zip
    sha512: NQxPQ+Mv0cT5oOwR1rX8k4H4X6TqQSl6an99h5xH1cckgrWYVW7UavzKRQ8nu49X1duwxjqAnCLl3i3mtPQqbw==
    size: 156
path: OpenFDE-0.0.2-test-mac.zip
sha512: NQxPQ+Mv0cT5oOwR1rX8k4H4X6TqQSl6an99h5xH1cckgrWYVW7UavzKRQ8nu49X1duwxjqAnCLl3i3mtPQqbw==
releaseDate: '2026-06-28T10:00:00.000Z'
```

`url` paths are relative to the feed base URL.

### Installer binaries

```
GET /desktop/releases/stable/<filename>
```

Serve file bytes or redirect to a public CloudFront URL.

---

## IAM sketch

**CI user (publish only):**

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject"],
  "Resource": "arn:aws:s3:::your-bucket/desktop/releases/*"
}
```

**CDN / API (read only on release prefix):**

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::your-bucket/desktop/releases/*"
}
```

Never embed CI or signing credentials in the desktop app.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| “Set BASE_API…” in packaged app | `env/.prod.env` not loaded at runtime (rebuild after env path fix) or missing `BASE_API` | Set `BASE_API` in `env/.prod.env`; rebuild; or override in `~/.openfde/config/.env` |
| Dev stuck on “Checking for updates” | `DESKTOP_UPDATE_FORCE_DEV` not set | Add to `env/.dev.env`, restart dev app |
| Download fails: `dev-app-update.yml` ENOENT | Dev mode without generated config | Set `DESKTOP_UPDATE_FORCE_DEV=true` (app writes `~/.openfde/config/dev-app-update.yml`) |
| Install fails: ShipIt / code signature | Unsigned or mismatched signing | Sign + notarize macOS builds; see [CODE-SIGNING.md](./CODE-SIGNING.md) |
| `sha512 checksum mismatch` | Feed `sha512`/`size` does not match zip | Re-upload matching artifact; use electron-builder-generated YAML |
| Windows SmartScreen warnings | Unsigned `.exe` | Set `WIN_SIGN_*` secrets / local `.pfx` |

---

## Configuration reference (quick lookup)

| Variable | Scope | Maps to / purpose |
| --- | --- | --- |
| `BASE_API` | Runtime | `app.base.apiUrl` — platform API + default update feed base |
| `app.desktop.releasesUrl` | Runtime | Override feed path under `BASE_API` |
| `DESKTOP_UPDATE_FORCE_DEV` | Runtime (dev only) | `app.desktop.forceDevUpdateConfig` |
| `MAC_SIGN_*` | Build | macOS signing + notarization — see [CODE-SIGNING.md](./CODE-SIGNING.md) |
| `WIN_SIGN_*` | Build | Windows Authenticode — see [CODE-SIGNING.md](./CODE-SIGNING.md) |
| `OPENFDE_BUILD_ENV` | Build | `dev` / `sit` / `prod` → selects `env/.dev.env`, `.sit.env`, `.prod.env` |
| `AWS_*`, `S3_RELEASE_BUCKET` | CI / local upload | S3 publish via `npm run release:upload-s3` |

---

## Related docs

- [CODE-SIGNING.md](./CODE-SIGNING.md) — certificates, notarization, secret encoding
- [RELEASE.md](./RELEASE.md) — version bumps and Release workflow checklist
- [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md) — build environments and local commands
- [SUPPORT-UPLOAD.md](./SUPPORT-UPLOAD.md) — support upload (requires sign-in; separate from updates)
