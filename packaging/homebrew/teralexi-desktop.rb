# typed: false
# Homebrew Cask for the Teralexi desktop app.
# Copy into Naughty-Otters/homebrew-tap Casks/teralexi-desktop.rb after each release.
#
# sha256 values are NOT edited by hand — the release pipeline fills them:
#   node scripts/update-desktop-cask-hashes.mjs
# (mac release job in .github/workflows/release.yml)
#
#   brew tap Naughty-Otters/tap
#   brew install --cask teralexi-desktop
#
# CLI formula remains Formula/teralexi.rb (brew install teralexi).

cask "teralexi-desktop" do
  version "0.0.6"
  desc "Local-first AI agent desktop app"
  homepage "https://www.teralexi.com/"

  livecheck do
    url "https://api.teralexi.com/desktop/releases/stable"
    regex(/Teralexi[._-]v?(\d+(?:\.\d+)+)(?:-arm64)?-mac\.zip/i)
  end

  on_arm do
    url "https://api.teralexi.com/desktop/releases/stable/Teralexi-#{version}-arm64-mac.zip"
    # Placeholder until next mac release job runs update-desktop-cask-hashes.mjs
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  end
  on_intel do
    url "https://api.teralexi.com/desktop/releases/stable/Teralexi-#{version}-mac.zip"
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  end

  app "Teralexi.app"

  zap trash: [
    "~/Library/Application Support/Teralexi",
    "~/Library/Preferences/app.teralexi.desktop.plist",
    "~/Library/Saved Application State/app.teralexi.desktop.savedState",
    "~/.teralexi",
  ]
end
