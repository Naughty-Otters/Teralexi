# typed: false
# Homebrew formula for the Teralexi CLI.
# Copy into Naughty-Otters/homebrew-tap Formula/teralexi.rb after each release.
# Hashes: node scripts/update-cli-package-hashes.mjs

class Teralexi < Formula
  desc "Local-first AI agent CLI (companion to Teralexi desktop)"
  homepage "https://www.teralexi.com/"
  version "0.0.6"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/Naughty-Otters/Teralexi/releases/download/v#{version}/teralexi-darwin-arm64.zip"
      sha256 "e77e955d04ef3514db62f7835c03de852b34fb00c28bf194527ae9c3211a5d20"
    end
    on_intel do
      url "https://github.com/Naughty-Otters/Teralexi/releases/download/v#{version}/teralexi-darwin-x64.zip"
      sha256 "e77e955d04ef3514db62f7835c03de852b34fb00c28bf194527ae9c3211a5d20"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/Naughty-Otters/Teralexi/releases/download/v#{version}/teralexi-linux-arm64.tar.gz"
      sha256 "e1b444d6a9d453580093cc9323c37666169351aa03b044237dae69c5803d9138"
    end
    on_intel do
      url "https://github.com/Naughty-Otters/Teralexi/releases/download/v#{version}/teralexi-linux-x64.tar.gz"
      sha256 "c918daf3d79f6314a59f9a9604367cfda1b6c8e4a1660c47647dc7bc5689295a"
    end
  end

  depends_on "node"

  def install
    libexec.install Dir["*"]
    (bin/"teralexi").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/cli.js" "$@"
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/teralexi --version")
  end
end
