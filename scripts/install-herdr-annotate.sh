#!/usr/bin/env bash
set -euo pipefail

# Install the full Herdr Annotate plugin. The plugin bundles the TUI used for
# reviews inside Herdr; bootstrap also installs the standalone plannotator-tui
# command for direct use.

export PATH="$HOME/.local/bin:$PATH"

plugin_id="annotate"
plugin_spec="plannotator/herdr-annotate"
min_herdr_version="0.8.0"

info() {
  printf 'install-herdr-annotate: %s\n' "$*"
}

warn() {
  printf 'install-herdr-annotate: warning: %s\n' "$*" >&2
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

if ! command -v herdr >/dev/null 2>&1; then
  warn "herdr not found; skipping plugin ${plugin_id}"
  exit 0
fi

if herdr plugin list 2>/dev/null | grep -Eq '^- annotate \(Annotate\) .*\[github:plannotator/herdr-annotate@'; then
  info "Herdr plugin ${plugin_id} already installed"
  exit 0
fi

if ! herdr_version_at_least; then
  warn "Herdr $(herdr --version 2>/dev/null | awk '{ print $2 }') is older than ${min_herdr_version}; skipping plugin ${plugin_id}"
  exit 0
fi

info "installing Herdr plugin ${plugin_spec}"
herdr plugin install "$plugin_spec" -y
