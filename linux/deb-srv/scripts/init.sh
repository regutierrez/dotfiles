#!/usr/bin/env bash
set -euo pipefail

# Debian initialization script - works both remotely and locally
# Usage (remote): curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/linux/deb-srv/scripts/init.sh | bash
# Usage (local):  bash linux/deb-srv/scripts/init.sh

GHUSER="regutierrez"
GITHUB_USERNAME="$GHUSER"
EMAIL="rpegutierrez@gmail.com"

echo "=== Debian Initialization ==="
echo ""

# Package list based on linux/arch-srv/user_configuration.json
# Arch names are mapped to Debian package names where needed.
APT_PACKAGES=(
  asciinema
  ast-grep
  build-essential
  bat
  btop
  cargo
  curl
  dpkg
  eza
  fakeroot
  fd-find
  ffmpeg
  fzf
  git
  golang-go
  jq
  neovim
  nvm
  openssh-client
  openssh-server
  python3-pymupdf
  qemu-guest-agent
  ripgrep
  rustc
  spice-vdagent
  starship
  tmux
  tree-sitter-cli
  uv
  zoxide
  zip
  zsh
)

echo "Configuration:"
echo "  GitHub user: $GHUSER"
echo "  Email: $EMAIL"
echo "  Package targets: ${#APT_PACKAGES[@]}"
echo ""

require_sudo() {
  if ! sudo -v; then
    echo "Error: sudo access is required."
    exit 1
  fi
}

install_packages() {
  echo "=== Installing APT Packages ==="

  sudo apt-get update -y

  local installable=()
  local unavailable=()
  local pkg

  for pkg in "${APT_PACKAGES[@]}"; do
    if apt-cache show "$pkg" >/dev/null 2>&1; then
      installable+=("$pkg")
    else
      unavailable+=("$pkg")
    fi
  done

  if [[ ${#installable[@]} -gt 0 ]]; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${installable[@]}"
  fi

  if [[ ${#unavailable[@]} -gt 0 ]]; then
    echo ""
    echo "Warning: These packages were not found in configured APT repos and were skipped:"
    printf '  - %s\n' "${unavailable[@]}"
    echo ""
  fi

  sudo apt-get autoremove -y
}

setup_dotfiles() {
  echo ""
  echo "=== Setting Up Dotfiles ==="
  echo ""

  sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply "$GITHUB_USERNAME"

  echo "Dotfiles applied successfully."
}

setup_ssh_key() {
  echo ""
  echo "=== Ensuring SSH Key ==="

  local ssh_key="$HOME/.ssh/id_ed25519"
  local ssh_pub_key="$HOME/.ssh/id_ed25519.pub"

  if [[ -f "$ssh_key" && -f "$ssh_pub_key" ]]; then
    echo "SSH key already exists at $ssh_key, skipping..."
    return
  fi

  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"

  echo "Generating new SSH key at $ssh_key..."
  ssh-keygen -t ed25519 -C "$EMAIL" -f "$ssh_key" -N ""
  chmod 600 "$ssh_key"
  chmod 644 "$ssh_pub_key"

  echo "SSH key generated."
  echo "Public key: $ssh_pub_key"
}

set_git_config() {
  local current_name current_email
  current_name=$(git config --global user.name 2>/dev/null || echo "")
  current_email=$(git config --global user.email 2>/dev/null || echo "")

  if [[ -n "$current_name" && -n "$current_email" ]]; then
    echo "Git already configured (name: $current_name, email: $current_email), skipping..."
    return
  fi

  echo "Configuring Git..."
  [[ -z "$current_name" ]] && git config --global user.name "$GHUSER"
  [[ -z "$current_email" ]] && git config --global user.email "$EMAIL"
}

set_default_shell() {
  if ! command -v zsh >/dev/null 2>&1; then
    return
  fi

  local current_shell
  current_shell=$(getent passwd "$USER" | cut -d: -f7)

  if [[ "$current_shell" == "$(command -v zsh)" ]]; then
    return
  fi

  echo "Setting default shell to zsh for $USER..."
  chsh -s "$(command -v zsh)"
}

main() {
  require_sudo
  install_packages
  set_git_config
  setup_dotfiles
  setup_ssh_key
  set_default_shell

  echo ""
  echo "=== Setup Complete ==="
  echo ""
  echo "Next steps:"
  echo "  1. Restart your terminal (or run: source ~/.zshrc)"
  echo "  2. Reboot machine for everything to take effect"
  echo ""
}

main
