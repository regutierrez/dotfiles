#!/usr/bin/env bash
# Remove retired Pi notification and Ghostty-tmux launch helpers.
# Herdr now owns agent-completion notifications and terminal/session launch.

set -euo pipefail

rm -f \
  "$HOME/.pi/agent/extensions/notify.ts" \
  "$HOME/.pi/agent/bin/focus-tmux-pane" \
  "$HOME/.config/tmux/start-ghostty-tmux.sh" \
  "$HOME/.config/tmux/ghostty-login-tmux.sh" \
  "$HOME/Library/LaunchAgents/com.regutierrez.ghostty-tmux.plist"

rmdir "$HOME/.config/tmux" 2>/dev/null || true
