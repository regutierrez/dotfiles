#!/usr/bin/env bash
set -euo pipefail

# Install terminal-browser with the official curl installer. When Herdr is
# present, also install the GitHub plugin zenbu-labs.terminal-browser.
# Invoked from linux/fedora/setup.sh and the macOS package installer.

export PATH="$HOME/.local/bin:$PATH"
# Skip upstream setup so it does not write ~/.agents/skills/terminal-browser.
# Chezmoi owns that skill.
export TERMINAL_BROWSER_SKIP_SETUP=1

plugin_id="zenbu-labs.terminal-browser"
plugin_spec="zenbu-labs/terminal-browser/herdr-plugin"
min_herdr_version="0.8.2"

info() {
  printf 'install-terminal-browser: %s\n' "$*"
}

warn() {
  printf 'install-terminal-browser: warning: %s\n' "$*" >&2
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

herdr_version_at_least() {
  local current lowest
  current="$(herdr --version 2>/dev/null | awk '{ print $2 }')"
  current="${current%%-*}"
  if [[ -z "$current" ]]; then
    return 1
  fi
  lowest="$(printf '%s\n%s\n' "$min_herdr_version" "$current" | sort -V | head -n1)"
  [[ "$lowest" == "$min_herdr_version" ]]
}

install_herdr_plugin() {
  if ! command -v herdr >/dev/null 2>&1; then
    warn "herdr not found; skipping plugin ${plugin_id}"
    return
  fi

  if herdr plugin list 2>/dev/null | grep -Fq "$plugin_id"; then
    info "Herdr plugin ${plugin_id} already installed"
    return
  fi

  if ! herdr_version_at_least; then
    warn "Herdr $(herdr --version 2>/dev/null | awk '{ print $2 }') is older than ${min_herdr_version}; skipping plugin ${plugin_id}"
    return
  fi

  info "installing Herdr plugin ${plugin_spec}"
  herdr plugin install "$plugin_spec" -y
}

install_terminal_browser_binary
install_herdr_plugin
