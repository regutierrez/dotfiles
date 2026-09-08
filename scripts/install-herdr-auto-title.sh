#!/usr/bin/env bash
set -euo pipefail

# Install the pinned Herdr Auto Title plugin. Unlink the retired window-numbers
# plugin first so both title writers never run together.

export PATH="$HOME/.local/bin:$PATH"

plugin_id="herdr.auto-title"
plugin_spec="kryptamine/herdr-auto-title"
plugin_ref="a34f22d1fc8a6037d171789cfda17289088527e0"
min_herdr_version="0.8.2"
retired_plugin_id="dotfiles.window-numbers"

info() {
  printf 'install-herdr-auto-title: %s\n' "$*"
}

warn() {
  printf 'install-herdr-auto-title: warning: %s\n' "$*" >&2
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

plugin_list="$(herdr plugin list 2>/dev/null || true)"

herdr plugin unlink "$retired_plugin_id" >/dev/null 2>&1 || true

if grep -Fq "github:${plugin_spec}@${plugin_ref}" <<<"$plugin_list"; then
  info "Herdr plugin ${plugin_id} already installed at ${plugin_ref}"
  exit 0
fi

if ! herdr_version_at_least; then
  warn "Herdr $(herdr --version 2>/dev/null | awk '{ print $2 }') is older than ${min_herdr_version}; skipping plugin ${plugin_id}"
  exit 0
fi

if ! command -v go >/dev/null 2>&1; then
  warn "go not found; skipping plugin ${plugin_id}"
  exit 0
fi

if grep -Fq "$plugin_id" <<<"$plugin_list"; then
  info "replacing Herdr plugin ${plugin_id} with ${plugin_ref}"
  herdr plugin uninstall "$plugin_id"
fi

info "installing Herdr plugin ${plugin_spec}@${plugin_ref}"
herdr plugin install "$plugin_spec" --ref "$plugin_ref" -y
