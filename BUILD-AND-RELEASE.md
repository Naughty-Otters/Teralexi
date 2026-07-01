# Build & Release Guide

This document explains how OpenFDE selects environment configuration, how to build locally, and how CI vs production releases work on GitHub Actions.

## Environment files

OpenFDE uses three build environments. Each maps to a file under `env/`:

| Mode | File | `OPENFDE_BUILD_ENV` | `NODE_ENV` | Purpose |
| --- | --- | --- | --- | --- |
| **Development** | `env/.dev.env` | `dev` | `development` | Local `npm run dev` |
| **Staging (SIT)** | `env/.sit.env` | `sit` | `sit` | CI builds, internal QA |
| **Production** | `env/.prod.env` | `prod` | `production` | Public releases |

**SIT** = System Integration Test (staging). Use it for pre-production builds that should not point at production APIs yet.

### What each file controls

Configure the OpenFDE platform backend once with `BASE_API`. At runtime it maps to `app.base.apiUrl`. Default endpoints are relative paths under that base:

| Endpoint | Default path |
| --- | --- |
| GraphQL metrics | `graphql` |
| Google sign-in | `auth/login` |
| Support upload | `support/upload` |

- **Build-time (main + renderer):** `BASE_API` is baked into both bundles from `env/.{mode}.env`. Packaged apps do not read env files at runtime — rebuild to change API targets.
- **Runtime (main process):** optional overrides such as `app.metrics.graphqlUrl` may be relative paths or legacy absolute URLs (via `config.properties` only).

**Code signing:** builds are **unsigned by default** (macOS and Windows). Add `MAC_SIGN_*` and/or `WIN_SIGN_*` to `~/.openfde/config/.env` (or CI secrets) when running electron-builder — see [docs/CODE-SIGNING.md](./docs/CODE-SIGNING.md).

Example `env/.dev.env`:

```properties
BASE_API = 'http://127.0.0.1:8000'
NODE_ENV = 'development'
```

### Editing env files

```text
env/
  .dev.env    # local development
  .sit.env    # staging / CI
  .prod.env   # production releases
```

Update URLs and secrets in the matching file before building for that environment. Do not commit real production secrets unless your team policy allows it.

---

## Local development

```bash
npm install
npm run dev          # uses env/.dev.env (-m dev)
```

`npm run dev` sets `OPENFDE_BUILD_ENV=dev` and loads `env/.dev.env` for both the build tooling and the running app.

---

## Local builds

All desktop builds run through `.electron-vite/build.ts` with a `-m` flag, then `electron-builder`.

### Production (default)

```bash
npm run build              # current platform, no publish
npm run build:mac          # macOS dmg + zip
npm run build:win64        # Windows x64 installer
npm run build:linux        # Linux AppImage
npm run build:dir          # unpacked output for inspection
```

### Staging (SIT)

```bash
npm run build:sit
npm run build:mac:sit
npm run build:win64:sit
npm run build:linux:sit
npm run build:dir:sit
```

### Renderer-only build (CI validation)

```bash
npm run build:web
```

### Environment flag reference

You can also pass the mode explicitly:

```bash
tsx .electron-vite/build.ts -m dev
tsx .electron-vite/build.ts -m sit
tsx .electron-vite/build.ts -m prod
```

Or set `OPENFDE_BUILD_ENV` (`dev` | `sit` | `prod`) before running a build script.

---

## GitHub Actions

### CI — staging (`env/.sit.env`)

**Workflow:** [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)

**Triggers:**

| Event | What runs |
| --- | --- |
| **Pull request** | Unit tests + signed macOS/Windows **sit** builds → GitHub artifacts |
| **Push** to any branch | Same as PR |
| **Push** to `main` | Same as PR + README CI status update |
| **Manual** | Actions → **CI** → Run workflow (full staging pipeline) |

**Build env:** `OPENFDE_BUILD_ENV=sit` → loads `env/.sit.env` (staging `BASE_API` only — same update feed path as prod).

**Scripts:** `build:mac:sit`, `build:win64:sit`

**Signing:** macOS and Windows jobs each receive platform-specific secrets (`MAC_SIGN_*` / `WIN_SIGN_*`). See [docs/CODE-SIGNING.md](./docs/CODE-SIGNING.md).

**Outputs:**

- Artifacts: `openfde-<platform>-sit-<run>-<sha>` (14-day retention)

### Release — production (`env/.prod.env`)

**Workflow:** [`.github/workflows/release.yml`](./.github/workflows/release.yml)

**Trigger:** Actions → **Release** → Run workflow → confirm `release`

**Build env:** `OPENFDE_BUILD_ENV=prod` → loads `env/.prod.env`

**Scripts:** `release:mac`, `release:win`

**Signing:** Same `MAC_SIGN_*` / `WIN_SIGN_*` secrets as CI (platform-specific per runner).

**Output:** Upload to `s3://…/desktop/releases/stable/` (production update feed)

---

## Creating a production release

### 1. Bump version and changelog

```bash
npm run version:patch   # or version:minor / version:major
# Edit CHANGELOG.md
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v0.0.2"
git push origin main
```

Optional: tag the commit (`git tag v0.0.2 && git push origin v0.0.2`) if you want the ref name to match the version.

### 2. Run the Release workflow

1. Open **Actions → Release → Run workflow**
2. Select the branch or tag to build from
3. Enter `release` in the confirm input

The workflow uses **`env/.prod.env`**, builds macOS and Windows installers, and uploads to S3.

If the workflow runs on a **version tag** (`v0.0.2`), the workflow verifies the tag matches `package.json`. When run manually from a branch, it publishes using the current `package.json` version.

### 3. Local build + S3 upload (optional)

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
export S3_RELEASE_BUCKET=your-bucket
export OPENFDE_BUILD_ENV=prod

npm run release:mac   # on macOS
npm run release:upload-s3
```

These scripts use `-m prod` and `env/.prod.env`. See [`docs/DESKTOP-RELEASES.md`](./docs/DESKTOP-RELEASES.md).

---

## Auto-update

Packaged apps check `{BASE_API}/desktop/releases/stable/` via `electron-updater` (generic provider). CI uploads installers to private S3; the update feed is served publicly (no sign-in).

**macOS in-app install** requires signed + notarized release builds. See [docs/CODE-SIGNING.md](./docs/CODE-SIGNING.md).

See [`docs/DESKTOP-RELEASES.md`](./docs/DESKTOP-RELEASES.md) and [`docs/RELEASE.md`](./docs/RELEASE.md).

---

## Quick reference

| Goal | Command / workflow |
| --- | --- |
| Run locally | `npm run dev` → `.dev.env` |
| PR / branch validation | **CI** workflow → `.sit.env`, signed sit artifacts |
| Staging update feed | Same path as prod on staging API: `{BASE_API}/desktop/releases/stable/` (publish separately) |
| Public production release | **Release** workflow → `.prod.env` → S3 `desktop/releases/stable/` |
| Change API URLs | Edit the matching file in `env/` |
