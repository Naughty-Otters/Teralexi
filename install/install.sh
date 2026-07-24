#!/usr/bin/env bash
# Teralexi CLI installer — OpenCode-style curl|bash entry.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Naughty-Otters/Teralexi/main/install/install.sh | bash
#   curl -fsSL https://www.teralexi.com/install | bash   # once site mirrors this file
#   curl -fsSL … | bash -s -- --version 0.0.5
set -euo pipefail

APP=teralexi
REPO="${TERALEXI_REPO:-Naughty-Otters/Teralexi}"
INSTALL_BASE="${TERALEXI_INSTALL_DIR:-}"
MUTED=$'\033[0;2m'
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
NC=$'\033[0m'

usage() {
  cat <<EOF
Teralexi Installer

Usage: install.sh [options]

Options:
    -h, --help              Show help
    -v, --version <ver>     Install a specific version (e.g. 0.0.5)
        --no-modify-path    Do not append PATH exports to shell rc files
        --npm-fallback      Prefer npm i -g teralexi-ai when no binary asset

Examples:
    curl -fsSL https://raw.githubusercontent.com/Naughty-Otters/Teralexi/main/install/install.sh | bash
    curl -fsSL https://www.teralexi.com/install | bash -s -- --version 0.0.5
EOF
}

requested_version="${VERSION:-}"
no_modify_path=false
npm_fallback=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -v|--version)
      [[ -n "${2:-}" ]] || { echo -e "${RED}--version requires an argument${NC}"; exit 1; }
      requested_version="$2"
      shift 2
      ;;
    --no-modify-path) no_modify_path=true; shift ;;
    --npm-fallback) npm_fallback=true; shift ;;
    --no-npm-fallback) npm_fallback=false; shift ;;
    *)
      echo -e "${MUTED}Unknown option: $1${NC}" >&2
      shift
      ;;
  esac
done

# Install dir priority (mirrors OpenCode):
# 1) TERALEXI_INSTALL_DIR  2) XDG_BIN_DIR  3) ~/bin  4) ~/.teralexi/bin
if [[ -z "$INSTALL_BASE" ]]; then
  if [[ -n "${XDG_BIN_DIR:-}" ]]; then
    INSTALL_BASE="$XDG_BIN_DIR"
  elif [[ -d "$HOME/bin" ]] || mkdir -p "$HOME/bin" 2>/dev/null; then
    INSTALL_BASE="$HOME/bin"
  else
    INSTALL_BASE="$HOME/.teralexi/bin"
  fi
fi
mkdir -p "$INSTALL_BASE"

raw_os=$(uname -s)
os=$(echo "$raw_os" | tr '[:upper:]' '[:lower:]')
case "$raw_os" in
  Darwin*) os="darwin" ;;
  Linux*) os="linux" ;;
  MINGW*|MSYS*|CYGWIN*) os="windows" ;;
esac

arch=$(uname -m)
case "$arch" in
  aarch64|arm64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
esac

if [[ "$os" == "darwin" && "$arch" == "x64" ]]; then
  rosetta=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)
  if [[ "$rosetta" == "1" ]]; then
    arch="arm64"
  fi
fi

combo="$os-$arch"
case "$combo" in
  linux-x64|linux-arm64|darwin-x64|darwin-arm64|windows-x64) ;;
  *)
    echo -e "${RED}Unsupported OS/Arch: $os/$arch${NC}"
    exit 1
    ;;
esac

archive_ext=".zip"
[[ "$os" == "linux" ]] && archive_ext=".tar.gz"
filename="${APP}-${combo}${archive_ext}"

resolve_version() {
  if [[ -n "$requested_version" ]]; then
    echo "${requested_version#v}"
    return
  fi
  local tag
  tag=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | sed -n 's/.*"tag_name": *"v\?\([^"]*\)".*/\1/p' \
    | head -1)
  if [[ -z "$tag" ]]; then
    echo ""
    return
  fi
  echo "$tag"
}

install_via_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}npm not found. Install Node.js 22+ or download a desktop build from https://www.teralexi.com/${NC}"
    exit 1
  fi
  local spec="teralexi-ai@latest"
  if [[ -n "$requested_version" ]]; then
    spec="teralexi-ai@${requested_version#v}"
  fi
  echo -e "${MUTED}Installing via npm:${NC} $spec"
  npm i -g "$spec"
  echo -e "${GREEN}Installed.${NC} Try: teralexi --version && teralexi doctor"
}

download_and_install_binary() {
  local version="$1"
  local url="https://github.com/${REPO}/releases/download/v${version}/${filename}"
  local tmp
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT

  echo -e "${MUTED}Downloading${NC} $filename ${MUTED}(v${version})${NC}"
  local http
  http=$(curl -sI -o /dev/null -w "%{http_code}" -L "$url" || true)
  if [[ "$http" != "200" && "$http" != "302" && "$http" != "301" ]]; then
    return 1
  fi

  curl -fsSL -L -o "$tmp/$filename" "$url"

  if [[ "$os" == "linux" ]]; then
    tar -xzf "$tmp/$filename" -C "$tmp"
  else
    unzip -q "$tmp/$filename" -d "$tmp"
  fi

  local bin_src
  bin_src=$(find "$tmp" -type f \( -name teralexi -o -name teralexi.exe -o -name teralexi.cmd \) | head -1)
  if [[ -z "$bin_src" ]]; then
    echo -e "${RED}Archive did not contain a teralexi binary${NC}"
    return 1
  fi

  local dest="$INSTALL_BASE/teralexi"
  if [[ "$os" == "windows" ]]; then
    dest="$INSTALL_BASE/teralexi.cmd"
  fi
  # Keep cli.js next to the launcher when present in the archive.
  local js_src
  js_src=$(find "$tmp" -type f -name cli.js | head -1)
  if [[ -n "$js_src" ]]; then
    cp "$js_src" "$INSTALL_BASE/cli.js"
    local ver_src
    ver_src=$(find "$tmp" -type f -name version.json | head -1)
    if [[ -n "$ver_src" ]]; then
      cp "$ver_src" "$INSTALL_BASE/version.json"
    fi
  fi
  mv "$bin_src" "$dest"
  chmod 755 "$dest" 2>/dev/null || true
  echo -e "${GREEN}Installed${NC} $dest"
  return 0
}

append_path_hint() {
  $no_modify_path && return 0
  case ":$PATH:" in
    *":$INSTALL_BASE:"*) return 0 ;;
  esac

  local line="export PATH=\"${INSTALL_BASE}:\$PATH\""
  local rc=""
  if [[ -n "${ZSH_VERSION:-}" ]] || [[ "${SHELL:-}" == *zsh* ]]; then
    rc="$HOME/.zshrc"
  elif [[ -n "${BASH_VERSION:-}" ]] || [[ "${SHELL:-}" == *bash* ]]; then
    rc="$HOME/.bashrc"
  else
    rc="$HOME/.profile"
  fi

  if [[ -f "$rc" ]] && grep -Fq "$INSTALL_BASE" "$rc" 2>/dev/null; then
    return 0
  fi
  echo "" >>"$rc"
  echo "# Teralexi CLI" >>"$rc"
  echo "$line" >>"$rc"
  echo -e "${MUTED}Added ${INSTALL_BASE} to PATH in ${rc}${NC}"
  echo -e "${MUTED}Restart your shell or: source ${rc}${NC}"
}

version=$(resolve_version)

if [[ -n "$version" ]] && download_and_install_binary "$version"; then
  append_path_hint
  echo -e "${GREEN}Done.${NC} Run: teralexi doctor"
  exit 0
fi

if [[ "$npm_fallback" == true ]]; then
  echo -e "${MUTED}No platform binary for this release yet — falling back to npm.${NC}"
  install_via_npm
  exit 0
fi

echo -e "${RED}Could not install Teralexi CLI.${NC}"
echo -e "${MUTED}Publish release assets named like ${filename}, or use: npm i -g teralexi-ai${NC}"
exit 1
