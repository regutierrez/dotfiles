#!/usr/bin/env bash
set -euo pipefail

# Launch Ghostty at login with one initial terminal handed directly to tmux.
# Regular Ghostty windows keep using the normal configured/default shell.
login_command="$HOME/.config/tmux/ghostty-login-tmux.sh"
open_command="${GHOSTTY_OPEN_COMMAND:-/usr/bin/open}"

if [[ -x "$login_command" ]]; then
  exec "$open_command" -na Ghostty.app --args "--initial-command=${login_command}"
fi

exec "$open_command" -na Ghostty.app
