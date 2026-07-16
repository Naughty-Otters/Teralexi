# Releasing Teralexi

> **See also:** [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md) — environment files, local builds, and GitHub Actions (CI vs Release).  
> **Desktop updates:** [DESKTOP-RELEASES.md](./DESKTOP-RELEASES.md) — S3 publish + public update feed.

Teralexi uses [Semantic Versioning](https://semver.org/). Installers are built from a **private GitHub repo** and published to **private S3**. Installed apps check for updates via `electron-updater` against `{BASE_API}/desktop/releases/stable/` (no sign-in required).

## Version source of truth

- **`package.json` → `version`** — currently `0.0.1`
- **`CHANGELOG.md`** — user-facing release notes
- Optional git tags: `v0.0.1`, `v0.0.2`, … (verified when the Release workflow runs on a tag ref)

## Day-to-day version bumps

```bash
# Patch: bug fixes
npm run version:patch

# Minor: new features
npm run version:minor

# Major: breaking changes
npm run version:major
```

Then edit `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD` section.

## Creating a release

### 1. Prepare the release commit

```bash
npm run version:patch   # or minor/major
# Edit CHANGELOG.md
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v0.0.2"
git push origin main
```

### 2. Configure GitHub secrets (one-time)

In GitHub **Settings → Secrets**, set:

**S3 publish**

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_RELEASE_BUCKET`

**Code signing** (optional for internal testing; required for smooth macOS auto-update and Windows SmartScreen):

| Platform | GitHub secret | Purpose |
| --- | --- | --- |
| macOS | `MAC_SIGN_CERTIFICATE_BASE64` | Base64-encoded `.p12` (Developer ID Application) |
| macOS | `MAC_SIGN_CERTIFICATE_PASSWORD` | Password for the `.p12` |
| macOS | `MAC_SIGN_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| macOS | `APPLE_ID` | Apple ID email (notarization) |
| macOS | `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| macOS | `APPLE_TEAM_ID` | 10-character Team ID from Apple Developer |
| Windows | `WIN_SIGN_CERTIFICATE_BASE64` | Base64-encoded `.pfx` |
| Windows | `WIN_SIGN_CERTIFICATE_PASSWORD` | Password for the `.pfx` |

See [CODE-SIGNING-APPLE.md](./CODE-SIGNING-APPLE.md) and [CODE-SIGNING-WINDOWS.md](./CODE-SIGNING-WINDOWS.md) for `env/.signing.env` setup and certificate encoding.

#### macOS notarization (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`)

You **do not** need these for local dev or unsigned builds. Set them only when publishing **signed, notarized** macOS installers (Release workflow or `npm run release:mac`) so other Macs trust the app and in-app update install works.

| Variable | GitHub secret | Where to get it |
| --- | --- | --- |
| `MAC_APPLE_ID` | `APPLE_ID` | Apple ID email for your [Apple Developer Program](https://developer.apple.com/programs) account |
| `MAC_APPLE_APP_SPECIFIC_PASSWORD` | `APPLE_APP_SPECIFIC_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security** → **App-Specific Passwords** → Generate (format `xxxx-xxxx-xxxx-xxxx`). **Not** your normal Apple ID password. |
| `MAC_APPLE_TEAM_ID` | `APPLE_TEAM_ID` | [developer.apple.com/account](https://developer.apple.com/account) → **Membership details** → **Team ID** (10 characters, e.g. `ABC123XYZ0`). Also appears in your signing identity: `Developer ID Application: Name (TEAMID)`. |

**Signing vs notarization:** `MAC_SIGN_*` signs the app with your Developer ID certificate. The three `MAC_APPLE_*` vars let electron-builder **notarize** the build with Apple. Both are required for production macOS distribution; signing alone is not enough for Gatekeeper on other machines.

**Local release build (optional):** configure `env/.signing.env` (see [CODE-SIGNING-APPLE.md](./CODE-SIGNING-APPLE.md)), then:

```bash
npm run release:mac
```

Implement public `GET /desktop/releases/stable/*` on your API or CDN before shipping updates to users.

### 3. Run the Release workflow

Production releases are **manual only**:

1. Open **Actions → Release → Run workflow**
2. Select the branch or tag to build from
3. Type `release` in the confirm input
4. Choose **platform**: `all` (default), `mac`, or `win`

The workflow uses **`env/.prod.env`**, builds **signed** installers for the selected platform(s), and uploads to S3 (`desktop/releases/stable/`).

If the workflow runs on a version tag (`v0.0.2`), it verifies the tag matches `package.json`. When run from a branch, it uses the current `package.json` version.

### Staging before release (CI)

**CI** runs automatically on **pull requests** and **pushes** to any branch:

| Step | Detail |
| --- | --- |
| Env | `TERALEXI_BUILD_ENV=sit` → `env/.sit.env` |
| Builds | Signed `build:mac:sit` + `build:win64:sit` |
| Artifacts | GitHub Actions (every PR/push) |

Use staging builds to validate installers before running the Release workflow.

### 4. Local build + S3 upload (optional)

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
export S3_RELEASE_BUCKET=your-bucket
export TERALEXI_BUILD_ENV=prod

npm run release:mac   # on macOS
npm run release:upload-s3

npm run release:win   # on Windows
npm run release:upload-s3
```

## Auto-update behavior

| When | Action |
| ---- | ------ |
| 30s after app launch | Silent check (packaged builds with `BASE_API` configured) |
| Every 6 hours | Background re-check |
| Settings → About | Manual “Check for updates” |
| Update available | User clicks “Download update” |
| Download complete | User clicks “Restart and install” |

Dev / unpackaged runs skip auto-update checks.

Feed URL: `{BASE_API}/desktop/releases/stable/` (override with `app.desktop.releasesUrl`). No authentication.

## Code signing (before public launch)

| Platform | Guide |
| -------- | ----- |
| **macOS** | [CODE-SIGNING-APPLE.md](./CODE-SIGNING-APPLE.md) — Developer ID signing + notarization |
| **Windows** | [CODE-SIGNING-WINDOWS.md](./CODE-SIGNING-WINDOWS.md) — Authenticode `.pfx` or Azure Trusted Signing |

Overview: [CODE-SIGNING.md](./CODE-SIGNING.md).

Set signing credentials via **shell environment variables** (local) or **GitHub Actions secrets** (Release workflow). Unsigned builds still work for internal testing on your own machine.

### When you need Apple notarization vars

| Goal | Need `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`? |
| --- | --- |
| `npm run dev`, unsigned `build:mac` | No |
| Signed build for your Mac only | No (signing cert is enough locally) |
| **Release workflow** or distributable prod DMG/ZIP | **Yes** (all three + `MAC_SIGN_*`) |

| Local export | GitHub secret | Source |
| --- | --- | --- |
| `MAC_APPLE_ID` | `APPLE_ID` | Apple Developer account email |
| `MAC_APPLE_APP_SPECIFIC_PASSWORD` | `APPLE_APP_SPECIFIC_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) → App-Specific Passwords |
| `MAC_APPLE_TEAM_ID` | `APPLE_TEAM_ID` | developer.apple.com → Membership → Team ID |

## Hot update (legacy)

`hot-updater` / `npm run pack:resources` is **not** used for production releases (`asar: true` in `build.json`). Use full installer updates via S3 + authenticated API only.

## First release checklist

- [ ] S3 bucket + IAM (CI write, API read)
- [ ] GitHub Actions secrets (`AWS_*`, `S3_RELEASE_BUCKET`)
- [ ] Public `GET /desktop/releases/stable/*` (API or CDN in front of S3)
- [ ] Production `BASE_API` in `env/.prod.env`
- [ ] Set up code signing (macOS Developer ID + notarization; Windows Authenticode)
- [ ] GitHub secrets: `MAC_SIGN_*`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_SIGN_*`
- [ ] Bump version, update `CHANGELOG.md`, push
- [ ] Run the **Release** workflow with confirm `release` and platform `all` / `mac` / `win`
- [ ] Verify S3 keys: `latest-mac.yml`, `latest.yml`, installers
- [ ] Install current version, publish next, confirm in-app update flow
