#!/usr/bin/env bash
set -e -u

# Mac initialization script - works both remotely and locally
# Usage (remote): bash <(curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/dotfiles/main/scripts/mac/mac_init.sh)
# Usage (local):  bash mac_init.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "$HOME")"
DOTFILES_DIR="$HOME/.dotfiles"
SSH_TYPE=ed25519
SSH_FILE="$HOME/.ssh/id_$SSH_TYPE"

echo "=== Mac Initialization ==="
echo ""

# Prompt for user information
read -p "Enter your GitHub username: " GHUSER
[[ -z "$GHUSER" ]] && { echo "Error: GitHub username is required."; exit 1; }

read -p "Enter your email: " EMAIL
[[ -z "$EMAIL" ]] && { echo "Error: Email is required."; exit 1; }

# Default packages
echo "Using default packages..."
BREW_PACKAGES=(
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
        zen
        ghostty
        karabiner-elements
    )

    MAS_APPS=(
        1352778147
    )

# Confirmation
echo ""
echo "Configuration:"
echo "  GitHub user: $GHUSER"
echo "  Email: $EMAIL"
echo "  Packages: ${#BREW_PACKAGES[@]} brew, ${#BREW_CASKS[@]} casks, ${#MAS_APPS[@]} App Store"
echo ""
read -p "Proceed? [y/N]: " confirm
[[ "$confirm" != "y" ]] && { echo "Aborted."; exit 0; }

# Install Xcode Command Line Tools
install_xcode() {
    [[ -d /Library/Developer/CommandLineTools ]] && { echo "Xcode CLI Tools already installed, skipping..."; return; }
    echo "Installing Xcode Command Line Tools..."
    xcode-select --install
    echo "Press any key after Xcode CLI Tools installation completes..."
    read -n 1
}

# Install Homebrew and packages
install_homebrew() {
    if command -v brew &>/dev/null; then
        echo "Homebrew already installed, skipping..."
    else
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        local homebrew_home=/opt/homebrew
        echo -e '\n# Homebrew' >> "$HOME/.zprofile"
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi

    echo "Installing Homebrew packages..."
    [[ ${#BREW_PACKAGES[@]} -gt 0 ]] && brew install "${BREW_PACKAGES[@]}"
    [[ ${#BREW_CASKS[@]} -gt 0 ]] && brew install --cask "${BREW_CASKS[@]}"
    [[ ${#MAS_APPS[@]} -gt 0 ]] && mas install "${MAS_APPS[@]}"

    brew cleanup
}

# Configure Git
set_git_config() {
    echo "Configuring Git..."
    git config --global user.name "$GHUSER"
    git config --global user.email "$EMAIL"
}

# Clone dotfiles repository
clone_dotfiles() {
    echo ""
    echo "=== Cloning Dotfiles Repository ==="
    echo ""

    local repo_url="https://github.com/$GHUSER/dotfiles.git"

    if [[ -d "$DOTFILES_DIR" ]]; then
        echo "Dotfiles directory already exists at $DOTFILES_DIR"
        read -p "Pull latest changes? [y/N]: " pull_confirm
        if [[ "$pull_confirm" == "y" ]]; then
            cd "$DOTFILES_DIR"
            git pull
        fi
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

    if [[ -d "$DOTFILES_DIR" ]]; then
        cd "$DOTFILES_DIR"
        echo "Running stow..."
        stow .
        echo "Dotfiles symlinked successfully."
    else
        echo "Warning: Dotfiles directory not found, skipping stow."
    fi
}

# Main execution
main() {
    install_xcode
    install_homebrew
    set_git_config
    clone_dotfiles
    stow_dotfiles

    echo ""
    echo "=== Setup Complete ==="
    echo ""
    echo "Next step:"
    echo "  Reboot machine for everything to take effect."
    echo ""
}

main
