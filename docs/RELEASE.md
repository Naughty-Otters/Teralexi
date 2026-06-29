# Releasing OpenFDE

> **See also:** [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md) — environment files, local builds, and GitHub Actions (CI vs Release).  
> **Desktop updates:** [DESKTOP-RELEASES.md](./DESKTOP-RELEASES.md) — S3 publish + public update feed.

OpenFDE uses [Semantic Versioning](https://semver.org/). Installers are built from a **private GitHub repo** and published to **private S3**. Installed apps check for updates via `electron-updater` against `{BASE_API}/desktop/releases/stable/` (no sign-in required).

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

### 2. Configure S3 secrets (one-time)

In GitHub **Settings → Secrets**, set:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_RELEASE_BUCKET`

See [DESKTOP-RELEASES.md](./DESKTOP-RELEASES.md) for IAM scope (CI write-only on `desktop/releases/*`).

Implement public `GET /desktop/releases/stable/*` on your API or CDN before shipping updates to users.

### 3. Run the Release workflow

Production releases are **manual only**:

1. Open **Actions → Release → Run workflow**
2. Select the branch or tag to build from
3. Type `release` in the confirm input

The workflow uses **`env/.prod.env`**, builds macOS and Windows installers, and uploads to S3 (`desktop/releases/stable/`).

If the workflow runs on a version tag (`v0.0.2`), it verifies the tag matches `package.json`. When run from a branch, it uses the current `package.json` version.

### 4. Local build + S3 upload (optional)

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
export S3_RELEASE_BUCKET=your-bucket
export OPENFDE_BUILD_ENV=prod

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

| Platform | Requirement |
| -------- | ----------- |
| **macOS** | Apple Developer ID + notarization for smooth updates |
| **Windows** | Authenticode certificate to reduce SmartScreen warnings |

Unsigned builds can still be published for internal testing; users may see OS security prompts.

## Hot update (legacy)

`hot-updater` / `npm run pack:resources` is **not** used for production releases (`asar: true` in `build.json`). Use full installer updates via S3 + authenticated API only.

## First release checklist

- [ ] S3 bucket + IAM (CI write, API read)
- [ ] GitHub Actions secrets (`AWS_*`, `S3_RELEASE_BUCKET`)
- [ ] Public `GET /desktop/releases/stable/*` (API or CDN in front of S3)
- [ ] Production `BASE_API` in `env/.prod.env`
- [ ] Set up code signing (macOS + Windows)
- [ ] Bump version, update `CHANGELOG.md`, push
- [ ] Run the **Release** workflow with confirm `release`
- [ ] Verify S3 keys: `latest-mac.yml`, `latest.yml`, installers
- [ ] Install current version, publish next, confirm in-app update flow
