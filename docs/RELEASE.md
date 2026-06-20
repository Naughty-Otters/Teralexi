# Releasing openfde

openfde uses [Semantic Versioning](https://semver.org/) and publishes desktop builds to **GitHub Releases**. Installed apps check for updates via `electron-updater`.

## Version source of truth

- **`package.json` → `version`** — currently `0.0.1`
- Git tags must match: `v0.0.1`, `v0.0.2`, …
- **`CHANGELOG.md`** — user-facing release notes

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
git tag v0.0.2
git push origin main --tags
```

### 2. CI builds and publishes

Pushing a tag matching `v*` triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml):

- Builds **macOS** (dmg + zip) and **Windows** (NSIS installer)
- Uploads artifacts to GitHub Releases
- Publishes `latest-mac.yml` / `latest.yml` for auto-update
- Verifies the pushed tag matches `package.json` version before publishing

The workflow can also be started manually with `workflow_dispatch`, but it still
requires the checked-out ref tag to match `package.json` exactly.

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
- [ ] Set up code signing (macOS + Windows)
- [ ] Tag and push `v0.0.1`
- [ ] Verify GitHub Release contains installers + `latest*.yml`
- [ ] Install `0.0.1`, bump to `0.0.2`, confirm in-app update flow
