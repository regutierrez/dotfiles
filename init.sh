#!/usr/bin/env zsh
set -e -u

GHUSER=regutierrez
EMAIL=11924623+regutierrez@users.noreply.github.com
REPO=ansible-macos-setup
DEST=$HOME
DIR=$DEST/$REPO
SSH_TYPE=ed25519
SSH_FILE=$HOME/.ssh/id_$SSH_TYPE

show_variables() {
  echo "running init.sh using the ff. variables:"
  echo "github user: $GHUSER"
  echo "email: $EMAIL"
  echo "repo to clone: $REPO"
  echo "DEST: $DEST"
  echo "DIR: $DIR"
  echo "SSH_TYPE: $SSH_TYPE"
  echo "SSH_FILE: $SSH_FILE"
}

generate_ssh_key() {
  if [[ -f $SSH_FILE ]]; then
    echo "ssh key already exists: $SSH_FILE. skipping..."
    return
  fi
  echo "generating ssh key: $SSH_FILE"
  ssh-keygen -q -t $SSH_TYPE -C "$EMAIL" -f $SSH_FILE <<<y >/dev/null 2>&1

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
  # if [[ $(command -v brew)="" ]]; then
  #   echo "homebrew is already installed. skipping..."
  #   return
  # fi
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  echo "adding environment variables to $HOME/.zprofile..."
  local homebrew_home=/opt/homebrew
  echo '# Homebrew' >> $HOME/.zprofile
  echo 'eval $('${homebrew_home}'/bin/brew shellenv)' >> $HOME/.zprofile
  eval $(${homebrew_home}/bin/brew shellenv)

}

set_git_config() {
  echo "setting git config"
  git config --global user.name "$GHUSER"
  git config --global user.email "$EMAIL"
}

init() {
  show_variables
  generate_ssh_key
  install_xcode
  install_homebrew
  set_git_config
}

init
