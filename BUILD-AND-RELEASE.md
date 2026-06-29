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

- **Build-time (renderer):** values like `BASE_API` are loaded into `__CONFIG__` during Vite/Rollup builds.
- **Runtime (main process):** dotted keys such as `app.metrics.graphqlUrl` and `app.openfde.googleAuthLoginUrl` override `config.properties` defaults.

User overrides in `~/.openfde/config/.env` always win over bundled env files.

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

Both workflows are **manual only** (`workflow_dispatch`). Run them from **Actions** in the GitHub UI.

### CI — staging builds

**Workflow:** [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)

**Trigger:** Actions → **CI** → **Run workflow**

**What it does:**

1. Unit tests with coverage on Ubuntu (`npm run test:unit:coverage`)
2. **Staging** desktop builds on macOS and Windows (`build:mac:sit`, `build:win64:sit`)
3. Uploads artifacts named `openfde-<platform>-sit-<run>-<sha>` (14-day retention)
4. Updates the CI status table at the top of [`README.md`](./README.md)

Use this for branch/PR validation and internal test installers before a release.

### Release — production builds

**Workflow:** [`.github/workflows/release.yml`](./.github/workflows/release.yml)

**Trigger:** Actions → **Release** → **Run workflow**

**Input:** type `release` in the confirm field.

**What it does:**

1. Verifies release version (see below)
2. Unit tests
3. **Production** builds on macOS and Windows (`release:mac`, `release:win`) with `OPENFDE_BUILD_ENV=prod`
4. Publishes installers and `latest*.yml` to GitHub Releases

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
4. Download artifacts or use the published GitHub Release

When run from a **version tag** (`v0.0.2`), the workflow verifies the tag matches `package.json`. When run manually from a branch, it publishes using the current `package.json` version.

### 3. Local publish (optional)

With `GH_TOKEN` set to a token that can create releases:

```bash
export GH_TOKEN=ghp_...
npm run release:mac   # on macOS
npm run release:win   # on Windows
```

These scripts use `-m prod` and `env/.prod.env`.

---

## Auto-update

Packaged apps check GitHub Releases via `electron-updater`. Dev / unpackaged runs skip update checks.

See [`docs/RELEASE.md`](./docs/RELEASE.md) for signing, hot-update notes, and a first-release checklist.

---

## Quick reference

| Goal | Command / workflow |
| --- | --- |
| Run locally | `npm run dev` → `.dev.env` |
| Internal test build | `npm run build:mac:sit` or CI workflow |
| Public release | Release workflow + `env/.prod.env` |
| Change API URLs | Edit the matching file in `env/` |
