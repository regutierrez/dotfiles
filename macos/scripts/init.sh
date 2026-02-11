#!/usr/bin/env bash
set -e -u

# Mac initialization script - works both remotely and locally
# Usage (remote): curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/scripts/mac/mac_init.sh | bash
# Usage (local):  bash mac_init.sh

DOTFILES_DIR="$HOME/.local/share/chezmoi"
GHUSER="regutierrez"
EMAIL="rpegutierrez@gmail.com"
AGE_IDENTITY_FILE="$HOME/.config/chezmoi/key.txt"

echo "=== Mac Initialization ==="
echo ""

# Default packages
echo "Using default packages..."
BREW_PACKAGES=(
  asciinema
  starship
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
  chezmoi
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
  xcode-select --install &>/dev/null || true

  local timeout=900 elapsed=0
  until xcode-select -p &>/dev/null; do
    if ((elapsed >= timeout)); then
      echo "Error: Xcode CLI Tools installation timed out after 15 minutes."
      exit 1
    fi
    sleep 5
    ((elapsed += 5))
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

    echo -e '\n# Homebrew' >>"$HOME/.zprofile"
    echo "eval '$(/opt/homebrew/bin/brew shellenv)'" >>"$HOME/.zprofile"
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi

  echo "Installing Homebrew packages..."
  [[ ${#BREW_PACKAGES[@]} -gt 0 ]] && brew install "${BREW_PACKAGES[@]}"
  [[ ${#BREW_CASKS[@]} -gt 0 ]] && brew install --cask "${BREW_CASKS[@]}"

  brew cleanup
}

# Setup dotfiles using chezmoi
setup_dotfiles() {
  echo ""
  echo "=== Setting Up Dotfiles ==="
  echo ""

  local repo_url="https://github.com/$GHUSER/dotfiles.git"

  if [[ -d "$DOTFILES_DIR" ]]; then
    echo "Dotfiles source already exists, updating and applying..."
    chezmoi update --init
  else
    chezmoi init --apply "$repo_url"
  fi

  echo "Dotfiles applied successfully."
}

# Ensure age identity is available before applying encrypted files
ensure_age_identity() {
  if [[ -f "$AGE_IDENTITY_FILE" ]]; then
    chmod 600 "$AGE_IDENTITY_FILE" 2>/dev/null || true
    return
  fi

  echo ""
  echo "Error: age identity file not found: $AGE_IDENTITY_FILE"
  echo "Restore your age key before running dotfiles setup."
  echo "Expected public recipient: age1jjprr9qsy2maxva7f3g2ll0z8px58343z0chunj3ljkjnw60kdhs5ypcjt"
  echo ""
  exit 1
}

# Add SSH key to macOS keychain so passphrase is remembered
setup_ssh_keychain() {
  echo ""
  echo "=== Configuring SSH Keychain ==="

  local ssh_key="$HOME/.ssh/id_ed25519"

  if [[ ! -f "$ssh_key" ]]; then
    echo "SSH key not found at $ssh_key, skipping..."
    return
  fi

  if ssh-add --apple-use-keychain "$ssh_key"; then
    echo "SSH key added to agent and macOS keychain."
  else
    echo "Warning: Could not add SSH key to keychain automatically."
    echo "Run this manually: ssh-add --apple-use-keychain ~/.ssh/id_ed25519"
  fi
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

# Main execution
main() {
  install_xcode
  install_homebrew
  set_git_config
  ensure_age_identity
  setup_dotfiles
  setup_ssh_keychain

  echo ""
  echo "=== Setup Complete ==="
  echo ""
  echo "Next steps:"
  echo "  1. Restart your terminal (or run: source ~/.zshrc)"
  echo "  2. Reboot machine for everything to take effect"
  echo ""
}

main
