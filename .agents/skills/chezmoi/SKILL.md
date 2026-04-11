---
name: chezmoi
description: Condensed chezmoi operating guide for this dotfiles repo. Use whenever a task touches dotfiles, home-directory config, chezmoi-managed files, source-state names like dot_/private_/encrypted_/executable_, .chezmoi* files, templates, profiles, secrets, or chezmoi commands such as init/add/edit/re-add/diff/status/apply/managed/forget/update.
---

# Chezmoi

Use this skill for any dotfiles task in this repo.

## Core model

- Chezmoi manages a **target state** (usually `~`) from a **source state** (repo) plus machine-specific config/data.
- In normal chezmoi usage, source dir defaults to `~/.local/share/chezmoi` and config defaults to `~/.config/chezmoi/chezmoi.toml`.
- In **this repository**, you are already editing the **source state**. Prefer changing repo files, then verify rendered output with chezmoi commands.
- Safe loop: inspect -> edit source -> `chezmoi diff` / `chezmoi cat` -> `chezmoi apply -n -v` -> apply for real only when asked.
- If something is surprising, run `chezmoi doctor` first.

## Repo map

- `dot_*` => leading dot in target (`dot_zshrc` -> `~/.zshrc`).
- `private_*` => restrictive perms (`0600` file / `0700` dir).
- `encrypted_*` => encrypted in source, decrypted on apply.
- `executable_*` => executable target.
- `.tmpl` => Go template rendered on apply.
- Use `chezmoi source-path <target>` / `chezmoi target-path <source>` if mapping is unclear.

Examples:
- `dot_zshrc` -> `~/.zshrc`
- `dot_config/lazygit/...` -> `~/.config/lazygit/...`
- `private_dot_ssh/` -> `~/.ssh/`
- `dot_tmux.conf.tmpl` -> rendered `~/.tmux.conf`

## Repo-specific facts

- Profiles live in `.chezmoidata.toml`: `desktop` default, `server` optional.
- `.chezmoiignore` is templated and gates files by OS/profile; patterns match **target paths**, not source paths.
- `.chezmoi.toml.tmpl` configures `age` encryption and sets `[edit] apply = true` and `watch = true`.
- Current bootstrap:
  - desktop: `sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply regutierrez`
  - server: `sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply --override-data '{"profile":"server"}' regutierrez`

## Daily workflow

1. Identify the **target path** the user cares about.
2. Map it to the **source path** in this repo.
3. Edit the source file directly in the repo.
4. Preview with:
   - `chezmoi cat <target>` for rendered contents
   - `chezmoi diff` for exact changes
   - `chezmoi status` for quick drift summary
   - `chezmoi apply -n -v` for dry-run
5. Only run real `chezmoi apply` if the user asks or the task clearly requires it.
6. If target files changed outside chezmoi and should become the new source truth, use `chezmoi re-add <target>`.

## Command crib sheet

- `chezmoi init [repo]` - initialize source repo; `--apply` applies immediately.
- `chezmoi add <target>` - start managing a target.
- `chezmoi add --template <target>` - add as template.
- `chezmoi add --encrypt <target>` - add encrypted.
- `chezmoi add --follow <target>` - migrate symlink-based dotfiles by following the symlink target.
- `chezmoi edit <target>` - edit source version; encrypted files are transparently decrypted/re-encrypted.
- `chezmoi edit --apply <target>` - edit then apply that target.
- `chezmoi diff [target]` - show what apply would change.
- `chezmoi status` - terse status similar to git.
- `chezmoi cat <target>` - print rendered target content without changing anything.
- `chezmoi data` - inspect template data.
- `chezmoi managed` - list managed targets.
- `chezmoi forget <target>` - stop managing a target.
- `chezmoi re-add [target]` - pull current target changes back into source, preserving encryption attrs.
- `chezmoi update` - pull repo changes then apply.
- `chezmoi verify` - exit nonzero if target drift exists.

## Editing rules

- Prefer editing **source files in this repo**, not files under `$HOME`, unless the task is explicitly about the live applied state.
- For encrypted files, do **not** hand-edit ciphertext; use `chezmoi edit` when operating on the applied setup.
- Preserve source-state attribute order when combining prefixes; order matters.
- Do not casually rename files with chezmoi prefixes/suffixes; that changes behavior.
- Use `chezmoi add --force` to replace a managed file from the current target state.
- Use `chezmoi re-add` when the live target drifted and should become canonical source.

## Templates, data, and conditionals

- Templates use Go `text/template` plus sprig and chezmoi helper functions.
- Rendered files usually depend on:
  - `.chezmoi.*` built-ins like `.chezmoi.os`, `.chezmoi.arch`, `.chezmoi.hostname`
  - `.chezmoidata.*` static data
  - config-file `[data]` values
- In this repo, profiles are driven from `.chezmoidata.toml` plus user-provided `profile` data.
- `chezmoi data` is the fastest way to see what a template can read.
- Empty template output removes the target unless the source uses `empty_`.
- Shared template fragments belong in `.chezmoitemplates`; external vendored content belongs in `.chezmoiexternal.*` when appropriate.

## Secrets and encryption

- Chezmoi supports password-manager lookups and encrypted files; this repo uses **age**.
- Age config belongs at top level of the chezmoi config (`encryption = "age"` before `[age]`).
- Encrypted source files typically look like `encrypted_*.<suffix>`; chezmoi decrypts them when needed for `edit`, `diff`, `status`, and `apply`.
- Keep secrets out of plain-text commits; do not auto-push unknown secret changes.

## Scripts and dangerous features

- `run_` scripts execute every apply; `run_onchange_` only when contents change; `run_once_` once per unique content.
- Scripts are imperative escape hatches; keep them idempotent and use sparingly.
- `run_before_` executes before entries update, `run_after_` after; apply order is deterministic and alphabetical by target name.
- Avoid `add --exact --recursive` on nested dirs unless you truly want stateful deletion of unmanaged siblings.
- Large externals are expensive to verify every run; prefer scripts for large downloads/unpacks.

## Migration and troubleshooting

- Migrating from GNU Stow/yadm/etc. symlink setups: use `chezmoi add --follow` so chezmoi captures file contents, not the symlink.
- If a program rewrites a config constantly, consider symlinking target -> source or using a `modify_` script/template.
- If behavior differs by machine, first inspect `.chezmoiignore`, template conditionals, and `chezmoi data`.
- If rendering or apply order looks wrong, check source attributes, scripts, and whether an external owns that path.

## Default assistant behavior for dotfiles tasks

- Think in **target path -> source path -> rendered output**.
- Favor minimal, source-of-truth edits.
- Preview before apply.
- Call out profile/OS/encryption side effects explicitly.
- If unsure, ask whether the user wants to change the **source repo**, the **live target**, or **both**.
