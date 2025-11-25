#!/usr/bin/env bash
set -e -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/init.config"
SSH_TYPE=ed25519
SSH_FILE="$HOME/.ssh/id_$SSH_TYPE"

load_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo "Error: Configuration file not found: $CONFIG_FILE"
        echo "Please copy .initconfig.example to .initconfig and fill in your values."
        exit 1
    fi
    source "$CONFIG_FILE"
}

confirm_config() {
    echo -e "Configuration:"
    echo "  GitHub user: $GHUSER"
    echo "  Email: $EMAIL"
    echo "  SSH type: $SSH_TYPE"
    echo "  SSH file: $SSH_FILE"
    echo -e "\nProceed? [y/n]:"
    read -r confirm
    [[ "$confirm" != "y" ]] && exit 1
}

generate_ssh_key() {
    [[ -f "$SSH_FILE" ]] && { echo "SSH key already exists, skipping..."; return; }

    echo "Generating SSH key: $SSH_FILE"
    ssh-keygen -q -t "$SSH_TYPE" -C "$EMAIL" -f "$SSH_FILE" -N ""
    eval "$(ssh-agent -s)"
    ssh-add "$SSH_FILE"
    echo "SSH key generated and added to ssh-agent."
}

install_xcode() {
    [[ -d /Library/Developer/CommandLineTools ]] && { echo "Xcode CLI Tools already installed, skipping..."; return; }

    echo "Installing Xcode Command Line Tools..."
    xcode-select --install
}

install_homebrew() {
    if command -v brew &>/dev/null; then
        echo "Homebrew already installed, skipping..."
    else
        echo "Installing Homebrew..."
        NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        local homebrew_home=/opt/homebrew
        echo -e '\n# Homebrew' >> "$HOME/.zprofile"
        eval "$(${homebrew_home}/bin/brew shellenv)" >> "$HOME/.zprofile"
    fi

    echo "Installing Homebrew packages..."
    [[ ${#BREW_PACKAGES[@]} -gt 0 ]] && brew install "${BREW_PACKAGES[@]}"
    [[ ${#BREW_CASKS[@]} -gt 0 ]] && brew install --cask "${BREW_CASKS[@]}"
    [[ ${#MAS_APPS[@]} -gt 0 ]] && mas install "${MAS_APPS[@]}"

    brew cleanup
}

set_git_config() {
    echo "Configuring Git..."
    git config --global user.name "$GHUSER"
    git config --global user.email "$EMAIL"
}

main() {
    load_config
    confirm_config
    # generate_ssh_key  # Uncomment when needed
    install_xcode
    install_homebrew
    set_git_config
    echo -e "\n✓ Initialization complete!"
}

main
