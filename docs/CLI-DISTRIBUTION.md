# CLI & package distribution

How Teralexi matches OpenCode-style installs:

```bash
# CLI + desktop (macOS/Windows). Use --cli-only for CLI alone.
curl -fsSL https://raw.githubusercontent.com/Naughty-Otters/Teralexi/main/install/install.sh | bash
curl -fsSL … | bash -s -- --cli-only
curl -fsSL … | bash -s -- --desktop-only

npm i -g teralexi-ai@latest
brew tap Naughty-Otters/tap && brew install teralexi                 # CLI
brew tap Naughty-Otters/tap && brew install --cask teralexi-desktop  # desktop
scoop install teralexi                                  # after scoop bucket mirrors packaging/scoop
choco install teralexi                                  # after choco package mirrors packaging/chocolatey
```

Preferred public alias (configure CDN/site to serve `install/install.sh`):

```bash
curl -fsSL https://www.teralexi.com/install | bash
```

Desktop zips/DMGs/NSIS also live at [api.teralexi.com/desktop/releases/stable](https://api.teralexi.com/desktop/releases/stable). The curl installer downloads the matching **mac zip** or **Windows Setup** from that channel (same artifacts electron-updater uses).

## Packages in this repo

| Path | Role |
| --- | --- |
| `packages/cli` | npm package **`teralexi-ai`**, bin `teralexi` |
| `install/install.sh` | curl\|bash installer (CLI + desktop from stable channel) |
| `packaging/homebrew/teralexi.rb` | Homebrew **formula** (CLI) |
| `packaging/homebrew/teralexi-desktop.rb` | Homebrew **cask** (desktop `.app`) |
| `packaging/scoop/teralexi.json` | Scoop manifest |
| `packaging/chocolatey/` | Chocolatey nuspec + install script |

## Desktop artifacts (stable channel)

Base: `https://api.teralexi.com/desktop/releases/stable/`

| Artifact | Platform |
| --- | --- |
| `Teralexi-<ver>-arm64-mac.zip` | macOS Apple Silicon (installer default) |
| `Teralexi-<ver>-mac.zip` | macOS Intel |
| `Teralexi Setup <ver>.exe` | Windows NSIS |
| `Teralexi-<ver>-arm64.dmg` / `.dmg` | macOS disk images (manual / site) |

Installer flags: `--desktop` (default on darwin/windows), `--cli-only`, `--desktop-only`.

## Release asset names (CLI GitHub Release)

| Asset | Platform |
| --- | --- |
| `teralexi-darwin-arm64.zip` | macOS Apple Silicon |
| `teralexi-darwin-x64.zip` | macOS Intel |
| `teralexi-linux-x64.tar.gz` | Linux x64 |
| `teralexi-linux-arm64.tar.gz` | Linux arm64 |
| `teralexi-windows-x64.zip` | Windows x64 |
| `checksums.json` | All sha256 digests |

## Publish checklist (automation)

| # | Item | How it’s done |
| --- | --- | --- |
| 1 | Sync CLI version with app | `npm run cli:sync-version` · CI `--check` |
| 2 | Build + publish `teralexi-ai` | `release.yml` → `npm-publish-cli` (needs `NPM_TOKEN`) |
| 3 | CI pack + attach to GitHub Release | `ci.yml` / `release.yml` `cli` jobs + `create-github-release.mjs` |
| 4 | brew/scoop/choco hashes (CLI) | `npm run cli:hashes` (runs in `cli:release-artifacts`) |
| 5 | Desktop cask sha256 | Release mac job: `node scripts/update-desktop-cask-hashes.mjs` (hashes local `build/*-mac.zip`, uploads `teralexi-desktop-cask` artifact) |
| 6 | Verify | Local: `npm run cli:release-artifacts` + `node packages/cli/bin/teralexi doctor` |

One-shot local:

```bash
npm run cli:release-artifacts
node packages/cli/bin/teralexi --version
node packages/cli/bin/teralexi doctor
npm --prefix packages/cli pack --dry-run
bash -c 'curl -fsSL https://raw.githubusercontent.com/Naughty-Otters/Teralexi/main/install/install.sh | bash -s -- --help'
```

## Headless `teralexi run`

Stubbed until the Electron agent core is extractable into a Node entry. Not production-ready yet.

## Skills & extensions via CLI

```bash
npx teralexi-ai skill install owner/repo
npx teralexi-ai extension install ./extensions/demo
```

Marker compatibility (`SKILL.md`, `skills.md`, `AGENT.md`, …) and the upstream `npx skills -a teralexi` snippet: [SKILLS-ECOSYSTEM.md](./SKILLS-ECOSYSTEM.md).
