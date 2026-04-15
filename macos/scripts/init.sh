#!/usr/bin/env bash
set -e -u

# Mac initialization script - works both remotely and locally
# Usage (remote): curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/init.sh | bash
# Usage (local):  bash macos/scripts/init.sh
# Overrides:
#   cat > ~/.config/dotfiles/bootstrap.sh <<'EOF'
#   BREW_PACKAGES=(ripgrep fd tmux)
#   BREW_CASKS=(ghostty raycast)
#   EOF
#   BOOTSTRAP_CONFIG=~/.config/dotfiles/bootstrap.sh bash macos/scripts/init.sh

BOOTSTRAP_CONFIG="${BOOTSTRAP_CONFIG:-$HOME/.config/dotfiles/bootstrap.sh}" # for work

echo "=== Mac Initialization ==="
echo ""

# Default config
GHUSER="regutierrez"
EMAIL="rpegutierrez@gmail.com"

# Default packages
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
  parsec
  homerow
  iina
  obsidian
  raycast
  ghostty
  karabiner-elements
)

load_bootstrap_config() {
  if [[ -f "$BOOTSTRAP_CONFIG" ]]; then
    echo "Loading bootstrap config: $BOOTSTRAP_CONFIG"
    # shellcheck disable=SC1090
    source "$BOOTSTRAP_CONFIG"
  else
    echo "Using default packages..."
  fi
}

# MAS_APPS=(
#   1352778147 # bitwarden
# )

# Install Xcode Command Line Tools
install_xcode() {
  if pkgutil --pkg-info=com.apple.pkg.CLTools_Executables &>/dev/null; then
    echo "Xcode CLI Tools already installed, skipping..."
    return
  fi

  echo "Installing Xcode Command Line Tools..."

  if ! sudo -v; then
    echo "Error: sudo is required to install Xcode CLI Tools without GUI prompts."
    exit 1
  fi

  local in_progress_file="/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress"
  local clt_label
  touch "$in_progress_file"
  trap 'rm -f "$in_progress_file"' RETURN

  clt_label=$(softwareupdate -l 2>/dev/null |
    awk '/\*.*Command Line Tools/ {
			line=$0
			sub(/^ *\* *Label: */, "", line)
			sub(/^ *\* */, "", line)
			print line
		}' |
    sort -V |
    tail -n 1)

  if [[ -z "$clt_label" ]]; then
    echo "Error: Could not find a Command Line Tools update via softwareupdate."
    echo "Try running softwareupdate -l manually, then rerun this script."
    exit 1
  fi

  sudo softwareupdate --install "$clt_label" --verbose
  sudo xcode-select --switch /Library/Developer/CommandLineTools || true

  local timeout=900 elapsed=0
  until pkgutil --pkg-info=com.apple.pkg.CLTools_Executables &>/dev/null; do
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

# Generate SSH key if one doesn't exist
create_ssh_key() {
  local ssh_key="$HOME/.ssh/id_ed25519"

  if [[ -f "$ssh_key" ]]; then
    echo "SSH key already exists at $ssh_key, skipping..."
    return
  fi

  echo ""
  echo "=== Generating SSH Key ==="
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  ssh-keygen -t ed25519 -C "$EMAIL" -f "$ssh_key" -N ""
  chmod 600 "$ssh_key"
  echo ""
  echo "SSH key generated. Add this public key to GitHub:"
  echo ""
  cat "${ssh_key}.pub"
  echo ""
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
  load_bootstrap_config
  echo ""
  echo "Configuration:"
  echo "  GitHub user: $GHUSER"
  echo "  Email: $EMAIL"
  echo "  Packages: ${#BREW_PACKAGES[@]} brew, ${#BREW_CASKS[@]} casks"
  echo ""
  install_homebrew
  set_git_config
  create_ssh_key
  setup_ssh_keychain

  echo ""
  echo "=== Setup Complete ==="
  echo ""
  echo "Next steps:"
  echo "  1. Run: chezmoi init --apply regutierrez"
  echo "  2. Restart your terminal (or run: source ~/.zshrc)"
  echo "  3. Reboot machine for everything to take effect"
  echo ""
}

main
