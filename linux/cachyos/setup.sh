#!/usr/bin/env bash
set -Eeuo pipefail

# Arch/CachyOS personal setup script.
# Re-run safely after editing package lists or config values.

# -----------------------------
# Config
# -----------------------------
GIT_USER_NAME="regutierrez"
GIT_USER_EMAIL="regutierrez@gmail.com"
SSH_KEY="$HOME/.ssh/id_ed25519"
INSTALL_DMS="false" # set true, or run: INSTALL_DMS=true ./arch-setup.sh

CLI_TOOLS=(
  asciinema
  ast-grep
  atuin
  bat
  docker-compose
  eza
  fakeroot
  ffmpeg
  fnm
  fzf
  git
  github-cli
  go
  jq
  lazygit
  git-delta
  pandoc-cli
  qemu-guest-agent
  ripgrep
  rust
  uv
  wl-clipboard
  zoxide
  zsh
  stow
  tree-sitter-cli
)

APPS_SERVICES=(
  joplin-bin
  helium-browser-bin
  google-chrome
  flatpak
  tailscale
)

# -----------------------------
# Helpers
# -----------------------------
info() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33mWARN: %s\033[0m\n' "$*"; }

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

install_dms() {
  if [[ "${INSTALL_DMS}" == "true" ]]; then
    info "Installing DMS with Niri + Ghostty"
    sudo -v
    curl -fsSL https://install.danklinux.com | sh -s -- -c niri -t ghostty -y
  else
    info "Skipping DMS install. Set INSTALL_DMS=true to enable."
  fi
}

install_packages() {
  require_command paru

  info "Updating package databases"
  paru -Syu --noconfirm

  info "Installing CLI tools and development utilities"
  paru -S --needed --noconfirm "${CLI_TOOLS[@]}"

  info "Installing applications and services"
  paru -S --needed --noconfirm "${APPS_SERVICES[@]}"
}

install_node() {
  require_command fnm

  info "Installing latest LTS Node.js with fnm"
  eval "$(fnm env --shell bash)"
  fnm install --lts
  fnm use --lts
  require_command node
  require_command npm
}

install_chrome_devtools_mcp() {
  require_command node
  require_command npm

  info "Installing/updating chrome-devtools-mcp"
  npm install -g chrome-devtools-mcp@latest
}

install_pi() {
  require_command curl
  require_command node
  require_command npm

  info "Installing/updating pi coding agent"
  curl -fsSL https://pi.dev/install.sh | sh
}

install_ampcode() {
  require_command curl

  info "Installing/updating Amp"
  curl -fsSL https://ampcode.com/install.sh | bash
}

install_zed() {
  require_command curl

  info "Installing/updating Zed editor"
  curl -f https://zed.dev/install.sh | sh
}

configure_git() {
  info "Configuring git"
  git config --global user.name "$GIT_USER_NAME"
  git config --global user.email "$GIT_USER_EMAIL"
}

configure_ssh() {
  info "Configuring SSH key"
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"

  if [[ -f "$SSH_KEY" ]]; then
    warn "SSH key already exists at $SSH_KEY; not overwriting"
  else
    ssh-keygen -t ed25519 -C "$GIT_USER_EMAIL" -f "$SSH_KEY" -N ""
  fi

  if command -v wl-copy >/dev/null 2>&1; then
    wl-copy <"${SSH_KEY}.pub"
    info "Copied public SSH key to clipboard"
  else
    warn "wl-copy not found; public key is:"
    cat "${SSH_KEY}.pub"
  fi
}

enable_services() {
  info "Enabling common services when available"

  if systemctl list-unit-files | grep -q '^tailscaled\.service'; then
    sudo systemctl enable --now tailscaled.service
  fi

  if systemctl list-unit-files | grep -q '^qemu-guest-agent\.service'; then
    sudo systemctl enable --now qemu-guest-agent.service || true
  fi
}

main() {
  info "Starting Arch/CachyOS setup"
  install_dms
  install_packages
  install_node
  install_chrome_devtools_mcp
  install_pi
  install_ampcode
  install_zed
  configure_git
  configure_ssh
  enable_services
  info "Setup complete"
}

main "$@"
