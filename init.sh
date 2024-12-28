#!/usr/bin/env bash
set -e -u

GHUSER=regutierrez
EMAIL=11924623+regutierrez@users.noreply.github.com
SSH_TYPE=ed25519
SSH_FILE=$HOME/.ssh/id_$SSH_TYPE

check_variables() {
  echo "running init.sh using the ff. variables:"
  echo "github user: $GHUSER"
  echo "email: $EMAIL"
  echo "SSH_TYPE: $SSH_TYPE"
  echo "SSH_FILE: $SSH_FILE"
  echo "is this correct? [y]es/[n]o: "
  if [ "${input}" = "n" ]; then
    exit 1
  fi
}

generate_ssh_key() {
  if [[ -f $SSH_FILE ]]; then
    echo "ssh key already exists: $SSH_FILE. skipping..."
    return
  fi
  echo "generating ssh key: $SSH_FILE"
  ssh-keygen -q -t "$SSH_TYPE" -C "$EMAIL" -f "$SSH_FILE" <<<y >/dev/null 2>&1

  echo "ssh key generated: $SSH_FILE."

  echo "Adding your SSH key to your ssh-agent..."
  eval "$(ssh-agent -s)"
  ssh-add "$SSH_FILE"
}

install_xcode() {
  echo "installing xcode"
  if [[ -d /Library/Developer/CommandLineTools ]]; then
    echo "Command Line Tools is already installed."
    return
  fi
  xcode-select --install
}

install_homebrew() {
  echo "installing homebrew..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  echo "adding environment variables to $HOME/.zprofile..."
  local homebrew_home=/opt/homebrew
  echo '# Homebrew' >> "$HOME"/.zprofile
  eval "$(${homebrew_home}/bin/brew shellenv)" >> "$HOME"/.zprofile
  sleep 5
  echo "installing packages via brew..."
  brew install neovim mkalias tmux eza zoxide fzf tldr go lazygit pyenv pandoc mas stow
  brew install --cask aldente shottr homerow iina obsidian raycast arc zed wezterm
  mas install 1352778147
  echo "do you want to instal personal apps? [y]es/[n]o: "
  read -r input

  if [ "${input}" = "y" ]; then
    brew install --cask protonvpn discord whatsapp
  fi

  brew cleanup

}

set_git_config() {
  echo "setting git config"
  git config --global user.name "$GHUSER"
  git config --global user.email "$EMAIL"
}

check_variables
# generate_ssh_key
install_xcode
install_homebrew
set_git_config
