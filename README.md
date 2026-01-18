# dotfiles

Personal macOS configuration and setup scripts.

## Setup

### Quick Setup

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/scripts/mac/mac_init.sh | bash
```

This will:
- Install Xcode Command Line Tools
- Install Homebrew and packages
- Configure Git (skips if already configured)
- Generate SSH key (skips if already exists)
- Clone this repo to `~/.dotfiles`
- Symlink dotfiles using stow

After completion, restart your terminal.

### Apply macOS System Settings (Optional)

To apply custom macOS system settings, run:

```bash
sudo bash ~/.dotfiles/scripts/mac/mac_settings.sh
```

Note: Requires sudo privileges. Some settings may require logout/restart to take effect.

### Manual Setup

```bash
git clone https://github.com/YOUR_USERNAME/dotfiles.git ~/.dotfiles
cd ~/.dotfiles
bash scripts/mac/mac_init.sh
sudo bash scripts/mac/mac_settings.sh
```

## What's Included

### Scripts (`scripts/mac/`)

- **`mac_init.sh`** - Main setup script (installs packages, configures git, clones repo)
- **`mac_settings.sh`** - macOS system settings (requires sudo)

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

Edit `scripts/mac/mac_settings.sh` to change macOS preferences.

## Updating

```bash
cd ~/.dotfiles
git pull
stow --restow .
```

## Notes
- need to change .git/config to use ssh to be able to push changes 
- Review scripts before running
- `mac_settings.sh` requires sudo and some settings need logout/restart to take effect
- Dotfiles are automatically symlinked using `stow` during setup
