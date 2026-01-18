#!/usr/bin/env bash
set -e -u

# Mac initialization script - works both remotely and locally
# Usage (remote): curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/scripts/mac/mac_init.sh | bash
# Usage (local):  bash mac_init.sh

DOTFILES_DIR="$HOME/.dotfiles"
SSH_TYPE=ed25519
SSH_FILE="$HOME/.ssh/id_$SSH_TYPE"
GHUSER="regutierrez"
EMAIL="rpegutierrez@gmail.com"

echo "=== Mac Initialization ==="
echo ""

# Default packages
echo "Using default packages..."
BREW_PACKAGES=(
  starship
  asciinema
  ripgrep
  uv
  tailscale
  fd
  ffmpeg
  rust
  neovim
  tmux
  eza
  zoxide
  fzf
  go
  tree-sitter-cli
  lazygit
  pandoc
  mas
  stow
  nvm
  mingw-w64
)

BREW_CASKS=(
  aldente
  shottr
  stats
  homerow
  iina
  obsidian
  parsec
  raycast
  zed
  vivaldi
  ghostty
  karabiner-elements
)

# MAS_APPS=(
#   1352778147 # bitwarden
# )

# Show configuration
echo ""
echo "Configuration:"
echo "  GitHub user: $GHUSER"
echo "  Email: $EMAIL"
echo "  Packages: ${#BREW_PACKAGES[@]} brew, ${#BREW_CASKS[@]} casks"
echo ""

# Install Xcode Command Line Tools
install_xcode() {
  if xcode-select -p &>/dev/null; then
    echo "Xcode CLI Tools already installed, skipping..."
    return
  fi

  echo "Installing Xcode Command Line Tools..."
  # Trigger install and wait for completion
  xcode-select --install &>/dev/null

  # Wait until installed
  until xcode-select -p &>/dev/null; do
    sleep 5
  done
  echo "Xcode CLI Tools installed."
}

# Install Homebrew and packages
install_homebrew() {
  if command -v brew &>/dev/null; then
    echo "Homebrew already installed, skipping..."
  else
    echo "Installing Homebrew..."
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    local homebrew_home=/opt/homebrew
    echo -e '\n# Homebrew' >>"$HOME/.zprofile"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >>"$HOME/.zprofile"
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi

  echo "Installing Homebrew packages..."
  [[ ${#BREW_PACKAGES[@]} -gt 0 ]] && brew install "${BREW_PACKAGES[@]}"
  [[ ${#BREW_CASKS[@]} -gt 0 ]] && brew install --cask "${BREW_CASKS[@]}"

  brew cleanup
}

# Setup SSH key (skip if already exists)
setup_ssh_key() {
  if [[ -f "$SSH_FILE" ]]; then
    echo "SSH key already exists at $SSH_FILE, skipping..."
    return
  fi

  echo "Generating SSH key..."
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  ssh-keygen -t "$SSH_TYPE" -C "$EMAIL" -f "$SSH_FILE" -N ""

  # Configure ssh-agent persistence
  if ! grep -q "AddKeysToAgent" "$HOME/.ssh/config" 2>/dev/null; then
    cat >> "$HOME/.ssh/config" <<EOF
Host *
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile $SSH_FILE
EOF
    chmod 600 "$HOME/.ssh/config"
  fi

  # Add key to keychain
  ssh-add --apple-use-keychain "$SSH_FILE" 2>/dev/null || ssh-add "$SSH_FILE"

  echo ""
  echo "SSH key generated. Public key:"
  cat "${SSH_FILE}.pub"
  echo ""
  echo "Add this key to GitHub: https://github.com/settings/keys"
}

# Configure Git (skip if already configured)
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

# Clone dotfiles repository
clone_dotfiles() {
  echo ""
  echo "=== Cloning Dotfiles Repository ==="
  echo ""

  local repo_url="https://github.com/$GHUSER/dotfiles.git"

  if [[ -d "$DOTFILES_DIR" ]]; then
    echo "Dotfiles directory already exists, pulling latest..."
    git -C "$DOTFILES_DIR" pull
  else
    git clone "$repo_url" "$DOTFILES_DIR"
    echo "Dotfiles cloned to $DOTFILES_DIR"
  fi
}

# Symlink dotfiles using stow
stow_dotfiles() {
  echo ""
  echo "=== Symlinking Dotfiles ==="
  echo ""

  if [[ ! -d "$DOTFILES_DIR" ]]; then
    echo "Warning: Dotfiles directory not found, skipping stow."
    return
  fi

  cd "$DOTFILES_DIR"
  # --adopt: take ownership of existing files (moves them into dotfiles, then symlinks)
  # --no-folding: create individual symlinks instead of symlinking parent dirs
  stow --adopt --no-folding -t "$HOME" .

  # Reset any adopted files to repo version
  git checkout .

  echo "Dotfiles symlinked successfully."
}

# Main execution
main() {
  install_xcode
  install_homebrew
  set_git_config
  setup_ssh_key
  clone_dotfiles
  stow_dotfiles

  echo ""
  echo "=== Setup Complete ==="
  echo ""
  echo "Next steps:"
  echo "  1. Restart your terminal (or run: source ~/.zshrc)"
  echo "  2. Reboot machine for everything to take effect"
  echo ""
}

main
