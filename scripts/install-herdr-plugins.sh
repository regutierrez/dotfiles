#!/usr/bin/env bash
set -euo pipefail

# Keep GitHub Herdr plugins present and current. Herdr 0.9 has no separate
# `plugin update`; reinstalling a GitHub plugin replaces its managed checkout,
# so unpinned plugins are reinstalled on every run to pick up new commits.
# Pinned plugins (--ref) are left alone once they are at the wanted commit.
# Local plugin links stay in the chezmoi run_after hook. Standalone
# plannotator-tui stays in the platform package flow.

export PATH="$HOME/.local/bin:$PATH"

info() {
  printf 'install-herdr-plugins: %s\n' "$*"
}

warn() {
  printf 'install-herdr-plugins: warning: %s\n' "$*" >&2
}

herdr_version_at_least() {
  local min_herdr_version="$1"
  local current lowest
  current="$(herdr --version 2>/dev/null | awk '{ print $2 }')"
  current="${current%%-*}"
  if [[ -z "$current" ]]; then
    return 1
  fi
  lowest="$(printf '%s\n%s\n' "$min_herdr_version" "$current" | sort -V | head -n1)"
  [[ "$lowest" == "$min_herdr_version" ]]
}

ensure_github_herdr_plugin() {
  local plugin_id="$1"
  local plugin_spec="$2"
  local min_herdr_version="$3"
  shift 3
  local plugin_ref="" needs_go=0 retired_plugin_id=""
  while (($#)); do
    case "$1" in
      --ref)
        plugin_ref="$2"
        shift 2
        ;;
      --go)
        needs_go=1
        shift
        ;;
      --retire)
        retired_plugin_id="$2"
        shift 2
        ;;
      *)
        warn "unknown argument for ${plugin_id}: $1"
        return 1
        ;;
    esac
  done

  if [[ -n "$retired_plugin_id" ]]; then
    herdr plugin unlink "$retired_plugin_id" >/dev/null 2>&1 || true
  fi

  local installed=0
  if grep -Fq "github:${plugin_spec}@" <<<"$plugin_list"; then
    installed=1
  fi
  if [[ -n "$plugin_ref" ]] && grep -Fq "github:${plugin_spec}@${plugin_ref}" <<<"$plugin_list"; then
    info "Herdr plugin ${plugin_id} already installed at ${plugin_ref}"
    return 0
  fi

  if ! herdr_version_at_least "$min_herdr_version"; then
    warn "Herdr $(herdr --version 2>/dev/null | awk '{ print $2 }') is older than ${min_herdr_version}; skipping plugin ${plugin_id}"
    return 0
  fi

  if ((needs_go)) && ! command -v go >/dev/null 2>&1; then
    warn "go not found; skipping plugin ${plugin_id}"
    return 0
  fi

  if [[ -n "$plugin_ref" ]] && grep -Fq "$plugin_id" <<<"$plugin_list"; then
    info "replacing Herdr plugin ${plugin_id} with ${plugin_ref}"
    herdr plugin uninstall "$plugin_id"
  fi

  local verb="installing"
  if ((installed)); then
    verb="updating"
  fi
  if [[ -n "$plugin_ref" ]]; then
    info "${verb} Herdr plugin ${plugin_spec}@${plugin_ref}"
    herdr plugin install "$plugin_spec" --ref "$plugin_ref" -y
  else
    info "${verb} Herdr plugin ${plugin_spec}"
    herdr plugin install "$plugin_spec" -y
  fi

  plugin_list="$(herdr plugin list 2>/dev/null || true)"
}

if ! command -v herdr >/dev/null 2>&1; then
  warn "herdr not found; skipping GitHub plugins"
  exit 0
fi

plugin_list="$(herdr plugin list 2>/dev/null || true)"

ensure_github_herdr_plugin annotate plannotator/herdr-annotate 0.8.0
ensure_github_herdr_plugin herdr.auto-title kryptamine/herdr-auto-title 0.8.2 \
  --ref a34f22d1fc8a6037d171789cfda17289088527e0 --go --retire dotfiles.window-numbers
ensure_github_herdr_plugin hseh regutierrez/hseh 0.9.0 --go
