#!/usr/bin/env bash
set -euo pipefail

# Install the terminal-browser binary with the official curl installer.
# Invoked from linux/fedora/setup.sh and the macOS package installer.

export PATH="$HOME/.local/bin:$PATH"
# Skip upstream setup so it does not write ~/.agents/skills/terminal-browser.
# The managed skill was retired; only the binary is installed via this script.
export TERMINAL_BROWSER_SKIP_SETUP=1

info() {
  printf 'install-terminal-browser: %s\n' "$*"
}

install_terminal_browser_binary() {
  if command -v terminal-browser >/dev/null 2>&1; then
    info "terminal-browser already installed"
    return
  fi

  info "installing terminal-browser"
  curl -fsSL https://terminal-browser.sh/install | bash

  if ! command -v terminal-browser >/dev/null 2>&1; then
    printf 'install-terminal-browser: installer finished but terminal-browser is not on PATH\n' >&2
    exit 1
  fi
}

install_terminal_browser_binary
