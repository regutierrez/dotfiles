# dotfiles

Personal macOS configuration and setup scripts.

## Setup

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/refs/heads/main/scripts/mac/mac_init.sh)
```

This will:
- Prompt for your GitHub username and email
- Install Xcode Command Line Tools
- Install Homebrew and packages
- Configure Git
- Apply macOS system settings
- Clone this repo to `~/.dotfiles`

After completion, restart your terminal.

### Manual Setup

```bash
git clone https://github.com/YOUR_USERNAME/dotfiles.git ~/.dotfiles
cd ~/.dotfiles
bash scripts/mac/mac_init.sh
```

## What's Included

### Scripts (`scripts/mac/`)

- **`mac_init.sh`** - Single all-in-one setup script

### Dotfiles

- `.zshrc` - Zsh configuration
- `.tmux.conf` - Tmux configuration
- `.config/` - App configs (ghostty, karabiner, zed)

## Customization

### Modify Packages

Edit the package arrays in `scripts/mac/mac_init.sh`:

```bash
BREW_PACKAGES=(git neovim ...)
BREW_CASKS=(iterm2 raycast ...)
MAS_APPS=(1352778147 ...)
```

### Modify System Settings

Edit the `apply_mac_settings()` function in `scripts/mac/mac_init.sh` to change macOS preferences.

## Updating

```bash
cd ~/.dotfiles
git pull
stow --restow .
```

## Notes

- Some settings require logout/restart to take effect
- Review script before running
- All system settings are embedded in `mac_init.sh` - no separate files needed
- Dotfiles are automatically symlinked using `stow` during setup
