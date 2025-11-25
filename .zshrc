eval "$(starship init zsh)"

if [[ -f "/opt/homebrew/bin/brew" ]] then
  # If you're using macOS, you'll want this enabled
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Set the directory we want to store zinit and plugins
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"

# Download Zinit, if it's not there yet
if [ ! -d "$ZINIT_HOME" ]; then
   mkdir -p "$(dirname $ZINIT_HOME)"
   git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi

# Source/Load zinit
source "${ZINIT_HOME}/zinit.zsh"

# Set up fzf key bindings and fuzzy completion
source <(fzf --zsh)
eval "$(zoxide init --cmd cd zsh)"

# Load completions
autoload -Uz compinit && compinit

# Add in zsh plugins
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions

# Keybindings
bindkey -e
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward
bindkey '^[w' kill-region

DISABLE_AUTO_TITLE=true

# History
HISTSIZE=100000
HISTFILE=~/.zsh_history
SAVEHIST=$HISTSIZE

# HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

# Completion styling
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' menu no
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'

#Add additional paths
export PATH=$PATH:$HOME/.local/bin/
export PATH=$PATH:$HOME/Library/Android/sdk/platform-tools/
export PATH=$PATH:$HOME/go/bin

# contains my helper scripts for aescape
export PATH=$PATH:$HOME/ae-repo/helper_scripts/scripts/
export PATH=$PATH:$HOME/ae-repo/aescape_platform_incubator/qa-helper-scripts/machine-interact-helper-scripts/
export PATH=$PATH:$HOME/ae-repo/robot-stack/utils/aescape_utils_py/
export AESCAPE_ROLE="qa"

# Aliases
alias ls='eza'
alias lg='lazygit'
alias v='nvim'
