# CLI & package distribution

How Teralexi matches OpenCode-style installs:

```bash
curl -fsSL https://raw.githubusercontent.com/Naughty-Otters/Teralexi/main/install/install.sh | bash
npm i -g teralexi-ai@latest
brew tap Naughty-Otters/tap && brew install teralexi   # after tap mirrors packaging/homebrew
scoop install teralexi                                  # after scoop bucket mirrors packaging/scoop
choco install teralexi                                  # after choco package mirrors packaging/chocolatey
```

Preferred public alias (configure CDN/site to serve `install/install.sh`):

```bash
curl -fsSL https://www.teralexi.com/install | bash
```

Desktop DMG/NSIS stays on [teralexi.com](https://www.teralexi.com/) / `api.teralexi.com`. The CLI is a **separate** artifact.

## Packages in this repo

| Path | Role |
| --- | --- |
| `packages/cli` | npm package **`teralexi-ai`**, bin `teralexi` |
| `install/install.sh` | curl\|bash installer (binary download → npm fallback) |
| `packaging/homebrew/teralexi.rb` | Homebrew formula (sha256 refreshed by `cli:hashes`) |
| `packaging/scoop/teralexi.json` | Scoop manifest |
| `packaging/chocolatey/` | Chocolatey nuspec + install script |

## Release asset names

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
| 4 | brew/scoop/choco hashes | `npm run cli:hashes` (runs in `cli:release-artifacts`) |
| 5 | Verify | Local: `npm run cli:release-artifacts` + `node packages/cli/bin/teralexi doctor` |

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
