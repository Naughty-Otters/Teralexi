# Releasing OpenFDE

> **See also:** [BUILD-AND-RELEASE.md](../BUILD-AND-RELEASE.md) — environment files, local builds, and GitHub Actions (CI vs Release).

OpenFDE uses [Semantic Versioning](https://semver.org/) and publishes desktop builds to **GitHub Releases**. Installed apps check for updates via `electron-updater`.

## Version source of truth

- **`package.json` → `version`** — currently `0.0.1`
- **`CHANGELOG.md`** — user-facing release notes
- Optional git tags: `v0.0.1`, `v0.0.2`, … (verified when the Release workflow runs on a tag ref)

## GitHub repo

Release publishing and auto-update feeds use:

| Field | Value |
| ----- | ----- |
| Owner | `Naughty-Otters` |
| Repo | `OpenFDE` |

These values are defined in `build.json` and `src/shared/app-update.ts`.

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

### 2. Run the Release workflow

Production releases are **manual only**:

1. Open **Actions → Release → Run workflow**
2. Select the branch or tag to build from
3. Type `release` in the confirm input

The workflow uses **`env/.prod.env`** (`OPENFDE_BUILD_ENV=prod`), builds macOS and Windows installers, and publishes to GitHub Releases.

If the workflow runs on a version tag (`v0.0.2`), it verifies the tag matches `package.json`. When run from a branch, it publishes using the current `package.json` version.

Requires `GITHUB_TOKEN` (provided automatically in GitHub Actions).

### 3. Local publish (optional)

With `GH_TOKEN` set to a PAT that can create releases:

```bash
export GH_TOKEN=ghp_...
npm run release:mac   # on macOS
npm run release:win   # on Windows
```

## Auto-update behavior

| When | Action |
| ---- | ------ |
| 30s after app launch | Silent check (packaged builds only) |
| Every 6 hours | Background re-check |
| Settings → About | Manual “Check for updates” |
| Update available | User clicks “Download update” |
| Download complete | User clicks “Restart and install” |

Dev / unpackaged runs skip auto-update checks.

## Code signing (before public launch)

| Platform | Requirement |
| -------- | ----------- |
| **macOS** | Apple Developer ID + notarization for smooth updates |
| **Windows** | Authenticode certificate to reduce SmartScreen warnings |

Unsigned builds can still be published for internal testing; users may see OS security prompts.

## Hot update (legacy)

`hot-updater` / `npm run pack:resources` is **not** used for production releases (`asar: true` in `build.json`). Use full installer updates via GitHub Releases only.

## First release checklist

- [ ] Confirm GitHub owner/repo in `build.json` and `src/shared/app-update.ts`
- [ ] Set production URLs in `env/.prod.env`
- [ ] Set up code signing (macOS + Windows)
- [ ] Bump version, update `CHANGELOG.md`, push
- [ ] Run the **Release** workflow with confirm `release`
- [ ] Verify GitHub Release contains installers + `latest*.yml`
- [ ] Install current version, bump to next, confirm in-app update flow
