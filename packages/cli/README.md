# Teralexi CLI (`teralexi-ai`)

Headless companion to the [Teralexi](https://www.teralexi.com/) desktop app.

## Install

```bash
# GitHub-hosted installer (works today)
curl -fsSL https://raw.githubusercontent.com/Naughty-Otters/Teralexi/main/install/install.sh | bash

# npm / bun / pnpm / yarn
npm i -g teralexi-ai@latest
```

## Usage

```bash
teralexi --version
teralexi doctor
teralexi open          # launch desktop app if installed
teralexi skill install owner/repo
teralexi extension install ./path/to/extension
teralexi run "…"       # headless agent (coming soon)
```

See [docs/SKILLS-ECOSYSTEM.md](../../docs/SKILLS-ECOSYSTEM.md) for Agent Skills / SKILL.md compatibility.

## Develop

From this package:

```bash
npm run build
node ./bin/teralexi doctor
```

## Release assets

Expected GitHub Release / CDN filenames (see `docs/CLI-DISTRIBUTION.md`):

- `teralexi-darwin-arm64.zip`
- `teralexi-darwin-x64.zip`
- `teralexi-linux-x64.tar.gz`
- `teralexi-linux-arm64.tar.gz`
- `teralexi-windows-x64.zip`
