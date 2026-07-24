#!/usr/bin/env bash
# Pack Node-based CLI into OpenCode-style platform archives (requires Node 22+ on target).
# Usage:
#   bash scripts/pack-cli-archive.sh              # all platforms → build/cli/
#   bash scripts/pack-cli-archive.sh build/cli    # custom out dir
#   bash scripts/pack-cli-archive.sh --host-only  # current host only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/packages/cli"
HOST_ONLY=false
OUT="$ROOT/build/cli"

for arg in "$@"; do
  case "$arg" in
    --host-only) HOST_ONLY=true ;;
    -*)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
    *) OUT="$arg" ;;
  esac
done

VERSION="$(node -p "require('$CLI/package.json').version")"

cd "$CLI"
npm run build

mkdir -p "$OUT"
rm -f "$OUT"/teralexi-*.zip "$OUT"/teralexi-*.tar.gz

stage_base="$(mktemp -d)"
trap 'rm -rf "$stage_base"' EXIT

cp "$CLI/dist/cli.js" "$stage_base/cli.js"
cp "$CLI/dist/version.json" "$stage_base/version.json"

# Unix launcher
cat >"$stage_base/teralexi" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Teralexi CLI requires Node.js 22+. Install from https://nodejs.org/" >&2
  exit 1
fi
exec node "$DIR/cli.js" "$@"
EOF
chmod 755 "$stage_base/teralexi"

# Windows launcher (cmd)
cat >"$stage_base/teralexi.cmd" <<'EOF'
@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Teralexi CLI requires Node.js 22+. Install from https://nodejs.org/
  exit /b 1
)
node "%~dp0cli.js" %*
EOF

pack_unix() {
  local os="$1"
  local arch="$2"
  local name="teralexi-${os}-${arch}"
  local dir="$stage_base/$name"
  mkdir -p "$dir"
  cp "$stage_base/cli.js" "$stage_base/version.json" "$stage_base/teralexi" "$dir/"
  chmod 755 "$dir/teralexi"
  if [[ "$os" == "linux" ]]; then
    tar -C "$dir" -czf "$OUT/${name}.tar.gz" teralexi cli.js version.json
    echo "wrote $OUT/${name}.tar.gz (v${VERSION})"
  else
    (cd "$dir" && zip -q "$OUT/${name}.zip" teralexi cli.js version.json)
    echo "wrote $OUT/${name}.zip (v${VERSION})"
  fi
}

pack_windows() {
  local name="teralexi-windows-x64"
  local dir="$stage_base/$name"
  mkdir -p "$dir"
  cp "$stage_base/cli.js" "$stage_base/version.json" "$stage_base/teralexi.cmd" "$dir/"
  (cd "$dir" && zip -q "$OUT/${name}.zip" teralexi.cmd cli.js version.json)
  echo "wrote $OUT/${name}.zip (v${VERSION})"
}

if [[ "$HOST_ONLY" == true ]]; then
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)
  case "$arch" in
    aarch64|arm64) arch=arm64 ;;
    x86_64|amd64) arch=x64 ;;
  esac
  case "$os" in
    darwin) pack_unix darwin "$arch" ;;
    linux) pack_unix linux "$arch" ;;
    mingw*|msys*|cygwin*) pack_windows ;;
    *)
      echo "Unsupported host: $os/$arch" >&2
      exit 1
      ;;
  esac
else
  pack_unix darwin arm64
  pack_unix darwin x64
  pack_unix linux x64
  pack_unix linux arm64
  pack_windows
fi

echo "CLI archives ready in $OUT (v${VERSION}):"
ls -la "$OUT"
