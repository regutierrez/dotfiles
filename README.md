# dotfiles

Managed with `chezmoi`.

## arch bootstrap
```bash
archinstall --config-url https://raw.githubusercontent.com/regutierrez/dotfiles/main/linux/arch-srv/user_configuration.json --creds-url https://raw.githubusercontent.com/regutierrez/dotfiles/main/linux/arch-srv/user_credentials.json
```
```
```

## macOS bootstrap

1. Restore age identity key to `~/.config/chezmoi/key.txt`
2. `chmod 600 ~/.config/chezmoi/key.txt`
3. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/init.sh | bash
```

## Apply macOS settings

```bash
curl -fsSL https://raw.githubusercontent.com/regutierrez/dotfiles/main/macos/scripts/settings.sh | sudo bash
```

## Daily use

```bash
chezmoi edit ~/.zshrc
chezmoi diff
chezmoi apply
```
