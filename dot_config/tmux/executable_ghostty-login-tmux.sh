#!/usr/bin/env bash
set -euo pipefail

# Start the user's macOS login shell so interactive environment setup runs,
# then replace it with tmux in this Ghostty window.
user_name="${USER:-$(/usr/bin/id -un)}"
login_shell="$(/usr/bin/dscl . -read "/Users/${user_name}" UserShell 2>/dev/null | /usr/bin/awk '/^UserShell:/ { print $2; exit }' || true)"
if [[ -z "$login_shell" || ! -x "$login_shell" ]]; then
  login_shell="${SHELL:-/bin/zsh}"
fi

case "${login_shell##*/}" in
  fish) exec "$login_shell" --login --interactive --command 'exec tmux' ;;
  *) exec "$login_shell" -lic 'exec tmux' ;;
esac
