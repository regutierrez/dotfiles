#!/usr/bin/env bash
set -Eeuo pipefail

profile="${CHEZMOI_PROFILE:-personal}"
if [[ "$profile" == "cachygaming" ]]; then
  profile="personal"
fi
source_dir="$(chezmoi source-path)"
local_bin="$HOME/.local/bin"
reboot_required=false
sudo_keepalive_pid=""

info() {
  printf '\nfedora-setup: %s\n' "$*"
}

warn() {
  printf 'fedora-setup: warning: %s\n' "$*" >&2
}

cleanup() {
  if [[ -n "$sudo_keepalive_pid" ]]; then
    kill "$sudo_keepalive_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'fedora-setup: required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

cache_sudo() {
  info "requesting administrator access"
  sudo -v
  while sleep 60; do
    sudo -n true >/dev/null 2>&1 || exit
  done &
  sudo_keepalive_pid="$!"
}

install_user_tools() {
  mkdir -p "$local_bin"
  export PATH="$local_bin:$HOME/.local/share/fnm:$PATH"

  if ! command -v starship >/dev/null 2>&1; then
    info "installing Starship"
    curl -fsSL https://starship.rs/install.sh | sh -s -- -y -b "$local_bin"
  fi

  if ! command -v herdr >/dev/null 2>&1; then
    info "installing Herdr"
    curl -fsSL https://herdr.dev/install.sh | sh
  fi

  if ! command -v mise >/dev/null 2>&1; then
    info "installing mise"
    curl -fsSL https://mise.run | sh
  fi

  if ! command -v fnm >/dev/null 2>&1; then
    info "installing fnm"
    curl -fsSL https://fnm.vercel.app/install | bash -s -- \
      --install-dir "$HOME/.local/share/fnm" --skip-shell
  fi

  if ! command -v lazygit >/dev/null 2>&1; then
    info "installing lazygit from its upstream Go module"
    GOBIN="$local_bin" go install github.com/jesseduffield/lazygit@latest
  fi

  if ! command -v ast-grep >/dev/null 2>&1; then
    info "installing ast-grep from its upstream Rust crate"
    cargo install ast-grep --locked --root "$HOME/.local"
  fi
}

configure_git() {
  local expected_name expected_email actual_name actual_email

  expected_name="$(git config --file <(chezmoi cat "$HOME/.gitconfig") --get user.name)"
  expected_email="$(git config --file <(chezmoi cat "$HOME/.gitconfig") --get user.email)"
  actual_name="$(git config --global --get user.name || true)"
  actual_email="$(git config --global --get user.email || true)"

  if [[ "$actual_name" != "$expected_name" || "$actual_email" != "$expected_email" ]]; then
    printf 'fedora-setup: Git identity does not match the managed configuration\n' >&2
    printf '  expected: %s <%s>\n  actual:   %s <%s>\n' \
      "$expected_name" "$expected_email" "$actual_name" "$actual_email" >&2
    exit 1
  fi

  info "Git identity is configured as $actual_name <$actual_email>"
}

configure_ssh() {
  local private_key="$HOME/.ssh/id_ed25519"
  local public_key="$HOME/.ssh/id_ed25519.pub"

  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"

  if [[ ! -e "$private_key" && ! -e "$public_key" ]]; then
    info "creating a passwordless Ed25519 machine key"
    ssh-keygen -q -t ed25519 -N '' -C "$USER@$(hostname -s)" -f "$private_key"
  elif [[ ! -f "$private_key" || ! -f "$public_key" ]]; then
    warn "only one Ed25519 key file exists; leaving both paths untouched"
    return
  fi

  chmod 600 "$private_key"
  chmod 644 "$public_key"
  info "SSH key: $(ssh-keygen -lf "$public_key")"
}

configure_login_shell() {
  local zsh_path current_shell
  zsh_path="$(command -v zsh)"
  current_shell="$(getent passwd "$USER" | cut -d: -f7)"

  if [[ "$current_shell" != "$zsh_path" ]]; then
    info "setting the login shell to $zsh_path"
    sudo usermod --shell "$zsh_path" "$USER"
  fi
}

configure_helium_command() {
  local system_helium

  if [[ -e "$local_bin/helium" || -L "$local_bin/helium" ]]; then
    return
  fi

  system_helium="$(PATH=/usr/local/bin:/usr/bin:/bin command -v helium || true)"
  if [[ -n "$system_helium" ]]; then
    ln -s "$system_helium" "$local_bin/helium"
  else
    warn "Helium is not installed; Caps+Q+G will not be able to launch it"
  fi
}

configure_keyd() {
  local source_config="$source_dir/linux/fedora/keyd/default.conf"
  local changed=false

  require_command keyd
  keyd check "$source_config"

  if ! cmp -s "$source_config" /etc/keyd/default.conf; then
    info "installing the Caps Lock keyd configuration"
    sudo install -D -m 0644 "$source_config" /etc/keyd/default.conf
    changed=true
  fi

  sudo systemctl enable --now keyd.service
  if [[ "$changed" == true ]]; then
    sudo systemctl restart keyd.service
  fi
}

configure_kde() {
  local profile_name desktop_file

  require_command kwriteconfig6

  kwriteconfig6 --file kcminputrc --group Keyboard --key KeyRepeat repeat
  kwriteconfig6 --file kcminputrc --group Keyboard --key RepeatDelay 200
  kwriteconfig6 --file kcminputrc --group Keyboard --key RepeatRate 50

  for profile_name in AC Battery LowBattery; do
    kwriteconfig6 --file powerdevilrc \
      --group "$profile_name" --group SuspendAndShutdown \
      --key AutoSuspendAction 0
  done

  if [[ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
    gdbus call --session \
      --dest org.kde.Solid.PowerManagement \
      --object-path /org/kde/Solid/PowerManagement \
      --method org.kde.Solid.PowerManagement.refreshStatus \
      >/dev/null 2>&1 || warn "PowerDevil is not running; settings will apply at next login"

    if ! systemctl --user is-active --quiet plasma-polkit-agent.service; then
      systemctl --user start plasma-polkit-agent.service || \
        warn "could not start KDE's PolicyKit agent"
    fi
  fi

  if command -v desktop-file-validate >/dev/null 2>&1; then
    for desktop_file in \
      caps-launch-dolphin.desktop \
      caps-launch-ghostty.desktop \
      caps-launch-helium.desktop \
      caps-launch-obsidian.desktop \
      caps-window-center.desktop; do
      desktop-file-validate "$HOME/.local/share/applications/$desktop_file"
    done
  fi

  if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 --noincremental >/dev/null
  fi
}

verify_nvidia() {
  local kernel_release kmod_package installed_version loaded_version

  if ! rpm -q akmod-nvidia >/dev/null 2>&1; then
    return
  fi

  kernel_release="$(uname -r)"
  kmod_package="kmod-nvidia-$kernel_release"

  if ! rpm -q "$kmod_package" >/dev/null 2>&1; then
    info "building the NVIDIA module for $kernel_release"
    sudo akmods --force --kernels "$kernel_release"
    if ! rpm -q "$kmod_package" >/dev/null 2>&1; then
      printf 'fedora-setup: NVIDIA module build did not produce %s\n' "$kmod_package" >&2
      exit 1
    fi
    reboot_required=true
  fi

  if command -v mokutil >/dev/null 2>&1 && mokutil --sb-state 2>/dev/null | grep -qi enabled; then
    warn "Secure Boot is enabled; the NVIDIA module must be signed and enrolled before it can load"
  fi

  installed_version="$(rpm -q --qf '%{VERSION}\n' xorg-x11-drv-nvidia 2>/dev/null | head -n 1)"
  loaded_version="$(cat /sys/module/nvidia/version 2>/dev/null || true)"

  if [[ -z "$loaded_version" || "$loaded_version" != "$installed_version" ]]; then
    reboot_required=true
  fi
  if [[ -d /sys/module/nouveau ]]; then
    warn "Nouveau is currently loaded; reboot to activate the NVIDIA driver"
    reboot_required=true
  fi

  info "NVIDIA package version: $installed_version"
}

print_summary() {
  info "setup complete"
  printf '  profile: %s\n' "$profile"
  printf '  login shell: %s\n' "$(getent passwd "$USER" | cut -d: -f7)"
  printf '  keyd: %s\n' "$(systemctl is-active keyd.service 2>/dev/null || true)"
  if command -v steam >/dev/null 2>&1; then
    printf '  Steam: installed\n'
  fi
  if flatpak info --user md.obsidian.Obsidian >/dev/null 2>&1; then
    printf '  Obsidian: installed\n'
  fi
  if [[ "$reboot_required" == true ]]; then
    printf '  reboot required: yes\n'
  else
    printf '  reboot required: no\n'
  fi
}

main() {
  require_command chezmoi
  require_command curl
  require_command git
  require_command ssh-keygen
  require_command zsh

  cache_sudo
  install_user_tools
  configure_git
  configure_ssh
  configure_login_shell

  if [[ "$profile" == "personal" ]]; then
    configure_helium_command
    configure_keyd
    configure_kde
    verify_nvidia
  fi

  print_summary
}

main "$@"
