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

# Apply macOS settings
apply_mac_settings() {
    echo ""
    echo "=== Applying macOS Settings ==="
    echo ""

    # Check for root privileges
    if [[ $EUID -ne 0 ]]; then
        RUN_AS_ROOT=false
        printf "Certain commands will not be run without sudo privileges. To run as root, run the same command prepended with 'sudo', for example: $ sudo $0\n\n" | fold -s -w 80
    else
        RUN_AS_ROOT=true
        # Update existing `sudo` timestamp until script finishes
        while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &
    fi

    ###############################################################################
    # General UI/UX                                                               #
    ###############################################################################

    # Expand save panel by default
    defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode -bool true

    # Save to disk (not to iCloud) by default
    defaults write NSGlobalDomain NSDocumentSaveNewDocumentsToCloud -bool false

    # Restart automatically if the computer freezes
    if [[ "$RUN_AS_ROOT" = true ]]; then
        systemsetup -setrestartfreeze on
    fi

    # Disable smart quotes as they're annoying when typing code
    defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false

    # Disable smart dashes as they're annoying when typing code
    defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false

    # Set background to dark-grey color
    osascript -e 'tell application "Finder" to set desktop picture to POSIX file "/System/Library/Desktop Pictures/Solid Colors/Black.png"'

    ###############################################################################
    # Trackpad, mouse, keyboard, Bluetooth accessories, and input                 #
    ###############################################################################

    # Trackpad: Haptic feedback (light, silent clicking)
    defaults write com.apple.AppleMultitouchTrackpad FirstClickThreshold -int 0
    defaults write com.apple.AppleMultitouchTrackpad SecondClickThreshold -int 0
    defaults write com.apple.AppleMultitouchTrackpad ActuationStrength -int 0
    defaults write com.apple.AppleMultitouchTrackpad TrackpadThreeFingerDrag -bool true

    # Disable press-and-hold for keys in favor of key repeat
    defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false

    # Set a blazingly fast keyboard repeat rate, and make it happen more quickly.
    # (The KeyRepeat option requires logging out and back in to take effect.)
    defaults write NSGlobalDomain InitialKeyRepeat -int 20
    defaults write NSGlobalDomain KeyRepeat -int 1

    # Disable auto-correct
    defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false

    ###############################################################################
    # Finder                                                                      #
    ###############################################################################

    # Set Desktop as the default location for new Finder windows
    # For other paths, use `PfLo` and `file:///full/path/here/`
    defaults write com.apple.finder NewWindowTarget -string "PfDe"
    defaults write com.apple.finder NewWindowTargetPath -string "file://${HOME}/Desktop/"

    # Show icons for hard drives, servers, and removable media on the desktop
    defaults write com.apple.finder ShowExternalHardDrivesOnDesktop -bool true
    defaults write com.apple.finder ShowHardDrivesOnDesktop -bool true
    defaults write com.apple.finder ShowMountedServersOnDesktop -bool true
    defaults write com.apple.finder ShowRemovableMediaOnDesktop -bool true

    # Finder: show all filename extensions
    defaults write NSGlobalDomain AppleShowAllExtensions -bool true

    # Finder: show status bar
    defaults write com.apple.finder ShowStatusBar -bool true

    # Finder: allow text selection in Quick Look
    defaults write com.apple.finder QLEnableTextSelection -bool true

    # Display full POSIX path as Finder window title
    defaults write com.apple.finder _FXShowPosixPathInTitle -bool true

    # When performing a search, search the current folder by default
    defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"

    # Disable the warning when changing a file extension
    defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false

    # Enable spring loading for directories
    defaults write NSGlobalDomain com.apple.springing.enabled -bool true

    # Remove the spring loading delay for directories
    defaults write NSGlobalDomain com.apple.springing.delay -float 0.1

    # Avoid creating .DS_Store files on network volumes
    defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true

    # Enable snap-to-grid for icons on the desktop and in other icon views
    /usr/libexec/PlistBuddy -c "Set :DesktopViewSettings:IconViewSettings:arrangeBy grid" ~/Library/Preferences/com.apple.finder.plist
    /usr/libexec/PlistBuddy -c "Set :FK_StandardViewSettings:IconViewSettings:arrangeBy grid" ~/Library/Preferences/com.apple.finder.plist
    /usr/libexec/PlistBuddy -c "Set :StandardViewSettings:IconViewSettings:arrangeBy grid" ~/Library/Preferences/com.apple.finder.plist

    # Set the size of icons on the desktop and in other icon views
    /usr/libexec/PlistBuddy -c "Set :DesktopViewSettings:IconViewSettings:iconSize 64" ~/Library/Preferences/com.apple.finder.plist
    /usr/libexec/PlistBuddy -c "Set :FK_StandardViewSettings:IconViewSettings:iconSize 64" ~/Library/Preferences/com.apple.finder.plist
    /usr/libexec/PlistBuddy -c "Set :StandardViewSettings:IconViewSettings:iconSize 64" ~/Library/Preferences/com.apple.finder.plist

    # Use column view in all Finder windows by default
    # Four-letter codes for the other view modes: `icnv`, `Nlsv`, `clmv`, `Flwv`
    defaults write com.apple.finder FXPreferredViewStyle -string "clmv"

    # Show the ~/Library folder
    chflags nohidden ~/Library

    ###############################################################################
    # Dock, Dashboard, and hot corners                                            #
    ###############################################################################

    # Set the icon size of Dock items
    defaults write com.apple.dock tilesize -int 30

    # Speed up Mission Control animations
    defaults write com.apple.dock expose-animation-duration -float 0.15

    # Auto-hide Dock
    defaults write com.apple.dock "autohide" -bool "true"

    # Make Dock icons of hidden applications translucent
    defaults write com.apple.dock showhidden -bool true

    # Enable the 'reduce transparency' option. Save GPU cycles.
    defaults write com.apple.universalaccess reduceTransparency -bool true

    # Hot corners
    # Possible values:
    #  0: no-op
    #  2: Mission Control
    #  3: Show application windows
    #  4: Desktop
    #  5: Start screen saver
    #  6: Disable screen saver
    #  7: Dashboard
    # 10: Put display to sleep
    # 11: Launchpad
    # 12: Notification Center
    # Bottom right screen corner → Mission Control
    defaults write com.apple.dock wvous-br-corner -int 2
    defaults write com.apple.dock wvous-br-modifier -int 0
    # Top right screen corner → Put display to sleep
    defaults write com.apple.dock wvous-tr-corner -int 10
    defaults write com.apple.dock wvous-tr-modifier -int 0

    ###############################################################################
    # Safari & WebKit                                                             #
    ###############################################################################

    # Enable the Develop menu and the Web Inspector in Safari
    defaults write com.apple.Safari IncludeDevelopMenu -bool true
    defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true
    defaults write com.apple.Safari com.apple.Safari.ContentPageGroupIdentifier.WebKit2DeveloperExtrasEnabled -bool true

    # Add a context menu item for showing the Web Inspector in web views
    defaults write NSGlobalDomain WebKitDeveloperExtras -bool true

    ###############################################################################
    # Mail                                                                        #
    ###############################################################################

    # Copy email addresses as `foo@example.com` instead of `Foo Bar <foo@example.com>` in Mail.app
    defaults write com.apple.mail AddressesIncludeNameOnPasteboard -bool false

    ###############################################################################
    # Spotlight                                                                   #
    ###############################################################################

    if [[ "$RUN_AS_ROOT" = true ]]; then
        # Disable Spotlight indexing for any volume that gets mounted and has not yet
        # been indexed before.
        # Use `sudo mdutil -i off "/Volumes/foo"` to stop indexing any volume.
        sudo defaults write /.Spotlight-V100/VolumeConfiguration Exclusions -array "/Volumes"

        # Restart spotlight
        killall mds > /dev/null 2>&1
    fi

    ###############################################################################
    # Activity Monitor                                                            #
    ###############################################################################

    # Show the main window when launching Activity Monitor
    defaults write com.apple.ActivityMonitor OpenMainWindow -bool true

    # Show all processes in Activity Monitor
    defaults write com.apple.ActivityMonitor ShowCategory -int 0

    ###############################################################################
    # Messages                                                                    #
    ###############################################################################

    # Disable smart quotes as it's annoying for messages that contain code
    defaults write com.apple.messageshelper.MessageController SOInputLineSettings -dict-add "automaticQuoteSubstitutionEnabled" -bool false

    # Disable continuous spell checking
    defaults write com.apple.messageshelper.MessageController SOInputLineSettings -dict-add "continuousSpellCheckingEnabled" -bool false

    ###############################################################################
    # App Store                                                                   #
    ###############################################################################

    # Disable in-app rating requests from apps downloaded from the App Store.
    defaults write com.apple.appstore InAppReviewEnabled -int 0

    # Restart affected applications
    # for app in "cfprefsd" "Dock" "Finder" "Mail" "SystemUIServer" "Terminal"; do
    #     killall "${app}" > /dev/null 2>&1
    # done

    echo "macOS settings applied."
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
    apply_mac_settings
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
