#!/usr/bin/env bash

apply() {
  if ! "$@" 2>/dev/null; then
    echo "FAILED: $*"
  fi
}

# Check for root privileges
if [[ $EUID -ne 0 ]]; then
  RUN_AS_ROOT=false
  printf "Certain commands will not be run without sudo privileges. To run as root, run the same command prepended with 'sudo', for example: $ sudo $0\n\n" | fold -s -w 80
else
  RUN_AS_ROOT=true
  # Update existing `sudo` timestamp until script finishes
  while true; do
    sudo -n true
    sleep 60
    kill -0 "$$" || exit
  done 2>/dev/null &
fi

###############################################################################
# General UI/UX                                                               #
###############################################################################

# Expand save panel by default
apply defaults write NSGlobalDomain NSNavPanelExpandedStateForSaveMode -bool true

# Save to disk (not to iCloud) by default
apply defaults write NSGlobalDomain NSDocumentSaveNewDocumentsToCloud -bool false

# Restart automatically if the computer freezes
# Note: May fail on newer macOS without Full Disk Access
if [[ "$RUN_AS_ROOT" = true ]]; then
  apply systemsetup -setrestartfreeze on
fi

# Disable smart quotes as they're annoying when typing code
apply defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false

# Disable smart dashes as they're annoying when typing code
apply defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false

# Set background to dark-grey color
apply osascript -e 'tell application "Finder" to set desktop picture to POSIX file "/System/Library/Desktop Pictures/Solid Colors/Black.png"'

###############################################################################
# Trackpad, mouse, keyboard, Bluetooth accessories, and input                 #
###############################################################################

# Trackpad: Haptic feedback (light, silent clicking)
apply defaults write com.apple.AppleMultitouchTrackpad FirstClickThreshold -int 0
apply defaults write com.apple.AppleMultitouchTrackpad SecondClickThreshold -int 0
apply defaults write com.apple.AppleMultitouchTrackpad ActuationStrength -int 0
apply defaults write com.apple.AppleMultitouchTrackpad TrackpadThreeFingerDrag -bool true

# Disable press-and-hold for keys in favor of key repeat
apply defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false

# Set a blazingly fast keyboard repeat rate, and make it happen more quickly.
# (The KeyRepeat option requires logging out and back in to take effect.)
apply defaults write NSGlobalDomain InitialKeyRepeat -int 20
apply defaults write NSGlobalDomain KeyRepeat -int 1

# Disable auto-correct
apply defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false

###############################################################################
# Finder                                                                      #
###############################################################################

# Set Home as the default location for new Finder windows
# For other paths, use `PfLo` and `file:///full/path/here/`
apply defaults write com.apple.finder NewWindowTarget -string "PfHm"
apply defaults write com.apple.finder NewWindowTargetPath -string "file://${HOME}"

# Show icons for hard drives, servers, and removable media on the desktop
apply defaults write com.apple.finder ShowExternalHardDrivesOnDesktop -bool true
apply defaults write com.apple.finder ShowHardDrivesOnDesktop -bool true
apply defaults write com.apple.finder ShowMountedServersOnDesktop -bool true
apply defaults write com.apple.finder ShowRemovableMediaOnDesktop -bool true

# Finder: quit app
apply defaults write com.apple.finder QuitMenuItem -bool true

# Finder: show all filename extensions
apply defaults write NSGlobalDomain AppleShowAllExtensions -bool true

# Finder: show status bar
apply defaults write com.apple.finder ShowStatusBar -bool true

# Finder: allow text selection in Quick Look
apply defaults write com.apple.finder QLEnableTextSelection -bool true

# Display full POSIX path as Finder window title
apply defaults write com.apple.finder _FXShowPosixPathInTitle -bool true

# When performing a search, search the current folder by default
apply defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"

# Disable the warning when changing a file extension
apply defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false

# Enable spring loading for directories
apply defaults write NSGlobalDomain com.apple.springing.enabled -bool true

# Remove the spring loading delay for directories
apply defaults write NSGlobalDomain com.apple.springing.delay -float 0.1

# Avoid creating .DS_Store files on network volumes
apply defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true

# Enable snap-to-grid for icons on the desktop and in other icon views
/usr/libexec/PlistBuddy -c "Add :DesktopViewSettings:IconViewSettings:arrangeBy string grid" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :DesktopViewSettings:IconViewSettings:arrangeBy grid" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :FK_StandardViewSettings:IconViewSettings:arrangeBy string grid" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :FK_StandardViewSettings:IconViewSettings:arrangeBy grid" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :StandardViewSettings:IconViewSettings:arrangeBy string grid" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :StandardViewSettings:IconViewSettings:arrangeBy grid" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || true

# Set the size of icons on the desktop and in other icon views
/usr/libexec/PlistBuddy -c "Add :DesktopViewSettings:IconViewSettings:iconSize integer 64" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :DesktopViewSettings:IconViewSettings:iconSize 64" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :FK_StandardViewSettings:IconViewSettings:iconSize integer 64" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :FK_StandardViewSettings:IconViewSettings:iconSize 64" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :StandardViewSettings:IconViewSettings:iconSize integer 64" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || \
/usr/libexec/PlistBuddy -c "Set :StandardViewSettings:IconViewSettings:iconSize 64" ~/Library/Preferences/com.apple.finder.plist 2>/dev/null || true

# Use column view in all Finder windows by default
# Four-letter codes for the other view modes: `icnv`, `Nlsv`, `clmv`, `Flwv`
apply defaults write com.apple.finder FXPreferredViewStyle -string "clmv"

# Show the ~/Library folder
apply chflags nohidden ~/Library

###############################################################################
# Dock, Dashboard, and hot corners                                            #
###############################################################################

# Set the icon size of Dock items
apply defaults write com.apple.dock tilesize -int 30

# Speed up Mission Control animations
apply defaults write com.apple.dock expose-animation-duration -float 0.15

# Auto-hide Dock
apply defaults write com.apple.dock autohide -bool true

# Make Dock icons of hidden applications translucent
apply defaults write com.apple.dock showhidden -bool true

# Enable the 'reduce transparency' option. Save GPU cycles.
apply defaults write com.apple.universalaccess reduceTransparency -bool true

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
apply defaults write com.apple.dock wvous-br-corner -int 2
apply defaults write com.apple.dock wvous-br-modifier -int 0
# Top right screen corner → Put display to sleep
apply defaults write com.apple.dock wvous-tr-corner -int 10
apply defaults write com.apple.dock wvous-tr-modifier -int 0

###############################################################################
# Safari & WebKit                                                             #
###############################################################################

# Enable the Develop menu and the Web Inspector in Safari
apply defaults write com.apple.Safari IncludeDevelopMenu -bool true
apply defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true
apply defaults write com.apple.Safari com.apple.Safari.ContentPageGroupIdentifier.WebKit2DeveloperExtrasEnabled -bool true

# Add a context menu item for showing the Web Inspector in web views
apply defaults write NSGlobalDomain WebKitDeveloperExtras -bool true

###############################################################################
# Mail                                                                        #
###############################################################################

# Copy email addresses as `foo@example.com` instead of `Foo Bar <foo@example.com>` in Mail.app
apply defaults write com.apple.mail AddressesIncludeNameOnPasteboard -bool false

###############################################################################
# Spotlight                                                                   #
###############################################################################

# Disable Spotlight indexing for external volumes
# Note: The old VolumeConfiguration method no longer works on modern macOS
# Use mdutil to disable indexing on specific volumes instead:
#   sudo mdutil -i off "/Volumes/foo"

###############################################################################
# Activity Monitor                                                            #
###############################################################################

# Show the main window when launching Activity Monitor
apply defaults write com.apple.ActivityMonitor OpenMainWindow -bool true

# Show all processes in Activity Monitor
apply defaults write com.apple.ActivityMonitor ShowCategory -int 0

###############################################################################
# Messages                                                                    #
###############################################################################

# Disable smart quotes as it's annoying for messages that contain code
apply defaults write com.apple.messageshelper.MessageController SOInputLineSettings -dict-add "automaticQuoteSubstitutionEnabled" -bool false

# Disable continuous spell checking
apply defaults write com.apple.messageshelper.MessageController SOInputLineSettings -dict-add "continuousSpellCheckingEnabled" -bool false

###############################################################################
# App Store                                                                   #
###############################################################################

# Disable in-app rating requests from apps downloaded from the App Store.
apply defaults write com.apple.appstore InAppReviewEnabled -int 0

# Restart affected applications
for app in "cfprefsd" "Dock" "Finder" "Mail" "SystemUIServer" "Terminal"; do
    killall "${app}" > /dev/null 2>&1 || true
done

echo "macOS settings applied."
